# Authentication, RBAC and audit

How staff sign in, how access is decided, and what is recorded. Customer
sign-in (phone + SMS OTP) is not built yet — see "Not done yet" below.

## Staff sign-in

- **Auth.js v5** (`next-auth@5.0.0-beta.32`) with the Credentials provider,
  configured in `src/lib/auth.ts`. Sign-in page: `/admin/login`.
- **Passwords**: Argon2id (`@node-rs/argon2`), OWASP parameters — 19 MiB
  memory, 2 passes, 1 lane. Stored as a PHC string; older, weaker hashes are
  upgraded transparently on the next successful sign-in.
- **Policy**: 12–128 characters, must not contain the email name, must not be
  one of the most common passwords. Length beats composition rules (NIST).
- **No account enumeration**: wrong password, unknown email, deactivated
  account and "no password set" all return the same message, and an unknown
  email still costs one Argon2 verification so timing does not leak.
- **Throttling**: 5 failures per email or 20 per IP within a fixed 15-minute
  window block further attempts (even with the right password) until the
  window ends. State lives in the `AuthThrottle` table (keys are SHA-256 of
  the email / IP). Before the password is checked, each attempt increments its
  counters atomically (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), so
  parallel requests on different serverless instances cannot slip past the
  limit; a successful sign-in gives its reservation back. Covered by a
  parallel-burst integration test.

## Sessions

Auth.js only allows the Credentials provider with JWT sessions, but the spec
requires sessions that can be revoked instantly. So:

1. A successful sign-in creates a row in `Session` holding the **SHA-256** of a
   random 256-bit token (the token itself is never stored).
2. The encrypted, HTTP-only Auth.js cookie carries only that token.
3. **Every request** re-validates it against the database
   (`validateSessionToken`), together with the account's active flag, role and
   location assignments.

Consequences: sign-out, deactivation, password reset and "end all sessions"
take effect on the very next request, and a changed role or location applies
immediately. Replaying a cookie captured before sign-out returns 401 — this is
covered by the HTTP smoke test.

**Lifetime** (deployment settings, validated in `src/config/env.ts`):

| Setting                              | Default       | Meaning                                        |
| ------------------------------------ | ------------- | ---------------------------------------------- |
| `STAFF_SESSION_IDLE_TIMEOUT_MINUTES` | 480 (8 hours) | signed out after this long without any request |
| `STAFF_SESSION_MAX_AGE_HOURS`        | 168 (7 days)  | signed out after this long, however active     |

`Session.lastSeenAt` is refreshed at most every 5 minutes, so the idle limit
is accurate to within 5 minutes. A dead session is deleted the moment it is
seen; `purgeExpiredAuthRecords()` removes the rest (and finished throttle
windows) via `GET /api/cron/auth-cleanup` with `Authorization: Bearer
<CRON_SECRET>` — to be scheduled with Vercel Cron in Phase 13. Without
`CRON_SECRET` the route answers 503.

Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS (`__Secure-` prefix),
encrypted with `AUTH_SECRET`.

## Roles and permissions

- Permission keys are defined in code: `src/modules/access/permissions.ts`.
- The seven system roles (`SYSTEM_ROLES`) are seeded into the `Role` table:

| Role               | Locations | Highlights                                          |
| ------------------ | --------- | --------------------------------------------------- |
| Super Admin        | all       | everything, the only role with `staff.manage`       |
| Store Manager      | all       | everything except staff and settings                |
| Branch Manager     | assigned  | stock, transfers, counts, orders, till, reports     |
| Branch Sales Staff | assigned  | till (`pos.sell`), stock lookup, orders, customers  |
| Order Staff        | assigned  | process/cancel orders, book couriers, returns       |
| Inventory Staff    | assigned  | stock, transfers, counts, reports — no orders/money |
| Content Editor     | all       | catalogue copy (`catalog.content`), banners, pages  |

The full matrix is shown at `/admin/staff`. Catalogue keys (`catalog.*`) are
described in `docs/CATALOG.md`; they replaced `product.read`, `product.write`
and `category.write` in migration `20261114122000_catalog_data_backfill`.

## Where access is checked

| Layer            | What                                                                 | File                                   |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------- |
| 1. Proxy         | No session cookie → redirect to sign-in. Cheap, never trusted alone. | `src/proxy.ts`                         |
| 2. Admin layout  | Valid, unrevoked session (database check).                           | `src/app/admin/(dashboard)/layout.tsx` |
| 3. Every page    | `requireStaffPage("permission")` → 403 page if missing.              | each `page.tsx`                        |
| 4. Every service | `assertPermission` / `assertLocationAccess` before any work.         | `*.service.ts`                         |
| 5. API routes    | `requireStaffApi("permission")` → 401 / 403 JSON.                    | `src/app/api/admin/*`                  |

The sidebar hides items a role cannot open, but that is a convenience only.

**Location scoping** (spec 4.6): `locationScope(staff)` returns `undefined`
(all locations) or the assigned ids, and every location-aware repository query
must apply it. `listAccessibleLocations()` is the source for location pickers.

## Staff management (`/admin/staff`, Super Admin only)

Create staff, change role and locations, deactivate/reactivate, reset a
password (ends their sessions), end all sessions. Safety rules in
`staff.service.ts`:

- nobody changes their own role, status or password there (no self-lock-out);
- the last active Super Admin can never be demoted or deactivated;
- branch-scoped roles need at least one location.

Every staff member can change their own password at `/admin/account`; other
devices are signed out.

## Audit log

`AuditLog` rows are append-only. Recorded today: sign-in succeeded / failed /
throttled, sign-out (with IP and user agent — the sign-out button calls our
own `logoutAction`, which audits before clearing the cookie), sessions ended, own password changed, staff created,
access changed, deactivated / reactivated, password reset, Super Admin
bootstrapped. Each row has actor, target, IP, user agent and sanitised
before/after values. `sanitizeForAudit` redacts any key that looks like a
password, hash, token, OTP, key or cookie, at any depth. Viewer:
`/admin/audit` (`audit.view`; latest 100 — filters and export in Phase 12).

## First Super Admin (one-time bootstrap)

```bash
# 1. put the password in .env.local for this single run (never commit it)
SUPER_ADMIN_PASSWORD="a long passphrase of your choice"
# 2. create the account (email defaults to admin@usexporthouse.com)
npm run auth:bootstrap
# 3. delete SUPER_ADMIN_PASSWORD from .env.local
# 4. sign in at /admin/login, then change the password under My account
```

The script refuses to run once an active Super Admin with a password exists,
never modifies an existing account, and never prints or audits the password.

## Retiring the seed placeholder (`admin@usexporthouse.local`)

The Phase 4 seed created a password-less placeholder Super Admin. After the
real Super Admin has signed in at least once:

```bash
npm run auth:retire-placeholder              # dry run, changes nothing
npm run auth:retire-placeholder -- --confirm # deactivates it
```

It only deactivates (never deletes), ends its sessions, writes a
`staff.deactivated` audit row, and refuses while no other active Super Admin
has signed in.

## Tests

| Command                    | What it covers                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | Roles and permission matrix, authorization rules, Argon2id + policy, throttling, session tokens, redirect safety, audit redaction, staff-service safety rules (mocked data)                                                                                               |
| `npm run test:integration` | Real PostgreSQL: sign-in, enumeration-safe failures, throttling by email and IP, sign-out, expiry, live role changes, deactivation and password reset ending sessions, own-password change, RBAC on staff management, location scoping, audit hygiene, bootstrap refusals |

Integration tests refuse to run unless the database name ends in `_test`.

## Not done yet

- **Customer phone + SMS OTP sign-in** and guest-order linking — decided for
  Phase 8 (with cart and checkout); the `OtpChallenge`
  table, the `SmsProvider` interface and the production guard for the
  console-only DevSmsProvider come with it.
- Editing role permissions from the admin (read-only matrix for now) — Phase 12.
- Two-factor authentication for staff.
