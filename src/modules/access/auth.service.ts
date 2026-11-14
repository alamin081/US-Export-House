import { AUTH_POLICY } from "@/config/constants";
import { env } from "@/config/env";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import {
  createSessionRecord,
  deleteDeadSessions,
  deleteExpiredThrottles,
  deleteSessionById,
  deleteSessionByTokenHash,
  findSessionWithStaff,
  findStaffForLogin,
  recordSuccessfulLogin,
  releaseThrottleAttempts,
  reserveThrottleAttempt,
  touchSession,
} from "./access.repository";
import type { LoginInput } from "./access.schema";
import { toPermissionKeys, type StaffContext } from "./authorization";
import { evaluateLoginThrottle, throttleKey } from "./login-throttle";
import { getTimingSafeDummyHash, hashPassword, needsRehash, verifyPassword } from "./password";
import { evaluateSession, sessionPolicyFrom, sessionPurgeCutoffs } from "./session-policy";
import { generateSessionToken, hashSessionToken } from "./session-token";

/** Idle timeout and absolute lifetime, from the deployment settings. */
export function staffSessionPolicy() {
  return sessionPolicyFrom({
    idleTimeoutMinutes: env.STAFF_SESSION_IDLE_TIMEOUT_MINUTES,
    maxAgeHours: env.STAFF_SESSION_MAX_AGE_HOURS,
  });
}

/**
 * Staff sign-in, session validation and sign-out.
 *
 * This is the only place credentials are checked. Auth.js calls it from the
 * Credentials provider; everything else (proxy, pages, actions, API routes)
 * relies on `validateSessionToken`.
 */

export type LoginFailureReason = "invalid_credentials" | "throttled";

export type LoginResult =
  | {
      ok: true;
      /** Opaque bearer token for the Auth.js cookie. Never stored in clear. */
      sessionToken: string;
      user: { id: string; email: string; name: string | null };
    }
  | { ok: false; reason: LoginFailureReason };

/**
 * Internal reasons recorded in the audit log. The person signing in only ever
 * sees "invalid credentials", so the response never reveals whether an email
 * has an account, is deactivated or has no password yet.
 */
type FailureDetail = "unknown_email" | "no_password" | "wrong_password" | "inactive" | "no_role";

export async function authenticateStaff(
  input: LoginInput,
  meta: RequestMeta,
): Promise<LoginResult> {
  // 1. Throttle before touching the password, per email and per IP. Each
  //    attempt reserves a slot atomically, so parallel requests are counted.
  const keys = [
    throttleKey("email", input.email),
    ...(meta.ip === null ? [] : [throttleKey("ip", meta.ip)]),
  ];
  const [attemptsForEmail = 1, attemptsForIp = 1] = await Promise.all(
    keys.map((key) => reserveThrottleAttempt(key, AUTH_POLICY.loginWindowSeconds)),
  );

  const decision = evaluateLoginThrottle({
    failuresForEmail: attemptsForEmail - 1,
    failuresForIp: attemptsForIp - 1,
  });
  if (!decision.allowed) {
    await recordAudit({
      actorUserId: null,
      action: AUDIT_ACTIONS.loginThrottled,
      entityType: "auth",
      entityId: input.email,
      after: { reason: decision.reason },
      meta,
    });
    return { ok: false, reason: "throttled" };
  }

  // 2. Always run exactly one Argon2 verification, even for unknown emails,
  //    so response timing does not reveal which accounts exist.
  const user = await findStaffForLogin(input.email);
  const hashToCheck = user?.passwordHash ?? (await getTimingSafeDummyHash());
  const passwordMatches = await verifyPassword(hashToCheck, input.password);

  let failure: FailureDetail | null = null;
  if (user === null) failure = "unknown_email";
  else if (user.passwordHash === null) failure = "no_password";
  else if (!passwordMatches) failure = "wrong_password";
  else if (!user.isActive) failure = "inactive";
  else if (user.role === null || user.role.deletedAt !== null) failure = "no_role";

  if (failure !== null || user === null || user.passwordHash === null) {
    await recordAudit({
      actorUserId: user?.id ?? null,
      action: AUDIT_ACTIONS.loginFailed,
      entityType: "auth",
      entityId: input.email,
      after: { reason: failure ?? "unknown_email" },
      meta,
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // 3. Open a database session. Only its SHA-256 is stored. A successful
  //    sign-in gives back its throttle reservation.
  await releaseThrottleAttempts(keys);
  const sessionToken = generateSessionToken();
  await createSessionRecord({
    userId: user.id,
    tokenHash: hashSessionToken(sessionToken),
    expires: new Date(Date.now() + staffSessionPolicy().maxAgeMs),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });

  // 4. Transparently upgrade hashes made with weaker parameters.
  const upgradedHash = needsRehash(user.passwordHash)
    ? await hashPassword(input.password)
    : undefined;
  await recordSuccessfulLogin(user.id, upgradedHash);

  await recordAudit({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.loginSucceeded,
    entityType: "user",
    entityId: user.id,
    meta,
  });

  return {
    ok: true,
    sessionToken,
    user: { id: user.id, email: user.email ?? input.email, name: user.name },
  };
}

/**
 * Resolves a session token to a staff context, or null when the session is
 * unknown, expired or revoked, or the account was deactivated, deleted or
 * lost its role. Runs on every authenticated request, so revocation and
 * permission changes take effect immediately.
 */
export async function validateSessionToken(token: string): Promise<StaffContext | null> {
  if (token === "") return null;

  const record = await findSessionWithStaff(hashSessionToken(token));
  if (record === null) return null;

  const now = Date.now();
  const check = evaluateSession(record, now, staffSessionPolicy());
  if (!check.valid) {
    // Dead sessions are removed now rather than waiting for the clean-up job.
    await deleteSessionById(record.id);
    return null;
  }

  const { user } = record;
  if (user.kind !== "STAFF" || !user.isActive || user.deletedAt !== null) return null;
  if (user.role === null || user.role.deletedAt !== null) return null;

  if (check.shouldTouch) await touchSession(record.id, new Date(now));

  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name,
    roleId: user.role.id,
    roleName: user.role.name,
    permissions: toPermissionKeys(user.role.permissions),
    allLocations: user.role.allLocations,
    locationIds: user.locationAccess.map((access) => access.locationId),
    sessionId: record.id,
    sessionExpiresAt: record.expires.toISOString(),
  };
}

/** Ends one session (sign-out). Unknown tokens are ignored. */
export async function revokeSessionToken(token: string, meta: RequestMeta): Promise<void> {
  if (token === "") return;

  const removed = await deleteSessionByTokenHash(hashSessionToken(token));
  if (removed === null) return;

  await recordAudit({
    actorUserId: removed.userId,
    action: AUDIT_ACTIONS.logout,
    entityType: "session",
    entityId: removed.id,
    meta,
  });
}

/**
 * Ends the session behind the current request (the sign-out button). Unlike
 * the Auth.js sign-out event, this runs inside a Server Action, so the audit
 * row carries the IP and user agent.
 */
export async function endStaffSession(sessionId: string, meta: RequestMeta): Promise<void> {
  const removed = await deleteSessionById(sessionId);
  if (removed === null) return;

  await recordAudit({
    actorUserId: removed.userId,
    action: AUDIT_ACTIONS.logout,
    entityType: "session",
    entityId: removed.id,
    meta,
  });
}

/**
 * Removes expired or idle sessions and finished throttle windows. Called by
 * the scheduled clean-up (`/api/cron/auth-cleanup`); safe to run at any time.
 */
export async function purgeExpiredAuthRecords(now = Date.now()) {
  const [sessions, throttles] = await Promise.all([
    deleteDeadSessions(sessionPurgeCutoffs(now, staffSessionPolicy())),
    deleteExpiredThrottles(new Date(now)),
  ]);
  return { sessions, throttles };
}
