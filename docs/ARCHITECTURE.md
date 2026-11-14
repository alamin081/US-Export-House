# Architecture

US Export House is a **modular full-stack monolith** on Next.js. There is no
separate backend service: Server Components read data, Server Actions perform
authenticated mutations, and Route Handlers serve webhooks and REST endpoints.

## Layers

| Layer          | Location                        | Responsibility                                                                    |
| -------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| Presentation   | `src/app`, `src/components`     | Pages, UI, Server Actions, Route Handlers. Takes input, calls a service, renders. |
| Business logic | `src/modules/*/*.service.ts`    | Business rules, Zod validation, permission + branch-access checks, transactions.  |
| Data access    | `src/modules/*/*.repository.ts` | Prisma queries only. Must start with `import "server-only"`.                      |
| Database       | PostgreSQL                      | The single source of truth.                                                       |

### Hard rules

1. Only `*.repository.ts` (and `src/lib/db.ts`) may import the Prisma client.
2. Business logic lives only in `*.service.ts`. A service may call another
   module's **service**, never another module's repository.
3. `page.tsx` never contains business logic.
4. Every external API (payment, courier, SMS, image storage) sits behind an
   interface in `src/integrations/` (`PaymentProvider`, `CourierProvider`,
   `SmsProvider`, `StorageProvider`).
5. Server Components fetch, Server Actions mutate, Route Handlers take webhooks.
6. Secrets are server-only environment variables, validated by Zod at startup.

Rules 1, 2 and 4 are enforced by `no-restricted-imports` zones in
`eslint.config.mjs`, so a violation fails `npm run lint` and CI. The remaining
rules are review conventions.

## Module anatomy

```
src/modules/<domain>/
  <domain>.schema.ts      Zod schemas + inferred types (the module's contract)
  <domain>.repository.ts  Prisma queries ("server-only")
  <domain>.service.ts     rules, validation, permissions, transactions
  <domain>.actions.ts     Server Actions - thin wrappers that call the service
  components/             UI owned by this domain
```

Domains: `catalog`, `inventory`, `locations`, `transfers`, `cart`, `checkout`,
`orders`, `pos`, `payments`, `shipping`, `coupons`, `customers`, `returns`,
`reports`, `content`, `settings`, `access`, `audit`.

## Multi-branch model (built in Phases 4 and 7)

- `Location` is either a `BRANCH` or a `WAREHOUSE`; online orders are fulfilled
  from the location flagged as the default online fulfilment location.
- Stock lives per location in `InventoryLevel` (`onHand`, `reserved`), and every
  change is appended to the `InventoryMovement` ledger, which is never deleted.
- Stock mutations run inside a transaction and use a conditional update
  (`WHERE onHand - reserved >= qty`) so concurrent orders cannot drive stock
  negative.
- Staff see only the locations listed in `StaffLocationAccess`. The check runs in
  the **service layer**, and repository queries always carry a location filter —
  hiding a button in the UI is never the access control.

## Database

PostgreSQL is the only source of truth. The schema is `prisma/schema.prisma`
(48 models, 28 enums) and is documented in the README; what matters for the
architecture is how it is reached:

```
*.repository.ts  ->  src/lib/db.ts  ->  src/generated/prisma/client  ->  pg  ->  PostgreSQL
```

- Prisma 7 generates its client to `src/generated/prisma` (gitignored,
  rebuilt by `npm run db:generate` and on `npm install`), and requires a driver
  adapter — `@prisma/adapter-pg`.
- `src/lib/db.ts` is the only file allowed to import the generated client. It
  caches the client on `globalThis` in development so hot reloads do not open a
  new pool each time.
- Only `*.repository.ts` files (and `src/modules/system/system.repository.ts`
  for the health probe) may import `src/lib/db.ts`. ESLint enforces both rules.
- Migrations are plain SQL under `prisma/migrations` and are applied with
  `prisma migrate deploy` in CI and production. Business invariants that Prisma
  cannot express — non-negative stock, order totals that add up, single
  defaults, order-number sequences — are CHECK constraints and partial unique
  indexes added by a migration, so no code path can bypass them.
- `prisma.config.ts` (Prisma 7) holds the connection string for the CLI, the
  migrations path and the seed command. The application never reads it; it uses
  the Zod-validated `env` module.

## Access control

Staff authentication and RBAC are described in [AUTH.md](AUTH.md). In short:
the proxy only checks that a session cookie exists; the admin layout, every
page, every Server Action, every API route and every service re-check the
session against the database and the required permission and location.

## Request flow

```
Browser
  -> src/proxy.ts            locale negotiation (Next.js 16 renamed middleware -> proxy)
  -> app/[locale]/...        Server Component or Server Action
       -> module.service     validate (Zod) -> check permission + location access
            -> repository    Prisma query inside a transaction when it writes
                 -> PostgreSQL
```

Webhooks (SSLCOMMERZ IPN, Steadfast status) arrive at
`src/app/api/webhooks/<provider>/route.ts`, verify the sender, and are
idempotent on the provider's transaction / consignment id.

## Internationalisation

`next-intl` with `bn` as the default locale served without a prefix and `en`
under `/en`. Per-request configuration is in `src/i18n/request.ts`, which reads
the matched locale through `next/root-params` so pages stay statically
renderable. UI strings live in `src/i18n/messages/{bn,en}.json`; product and
content text gets bilingual fields in the database (decided in Phase 4).

The admin dashboard is English-only for now but is written with the same
`next-intl` primitives, so adding Bengali later does not require rewrites.

## Money

Amounts are integer **poisha** (1 BDT = 100 poisha) everywhere: database,
services, API payloads. `src/lib/money.ts` is the only place that converts,
rounds or formats money, so the rounding rule for discounts exists once.

## Hosting

Vercel + managed PostgreSQL (Singapore) + Cloudinary/S3 for images. Anything
Vercel-specific (cron, blob, edge config) stays behind an adapter in
`src/integrations/`, keeping a later move to Docker + Nginx on a VPS a hosting
change rather than a rewrite.
