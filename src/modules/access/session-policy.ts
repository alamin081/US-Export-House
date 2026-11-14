/**
 * Staff session lifetime rules — pure, so they are unit-tested without a
 * database or a clock.
 *
 * A session ends at whichever comes first:
 *   - the absolute expiry stored on the row (`expires`, set at sign-in), or
 *   - the idle timeout, counted from `lastSeenAt`.
 *
 * `lastSeenAt` is refreshed at most once per touch interval, so an active
 * staff member costs one small UPDATE every few minutes, not one per request.
 */
import { AUTH_POLICY } from "@/config/constants";

export interface SessionPolicy {
  idleTimeoutMs: number;
  maxAgeMs: number;
  touchIntervalMs: number;
}

export function sessionPolicyFrom(settings: {
  idleTimeoutMinutes: number;
  maxAgeHours: number;
}): SessionPolicy {
  return {
    idleTimeoutMs: settings.idleTimeoutMinutes * 60 * 1000,
    maxAgeMs: settings.maxAgeHours * 60 * 60 * 1000,
    touchIntervalMs: AUTH_POLICY.sessionTouchIntervalSeconds * 1000,
  };
}

export type SessionCheck =
  { valid: true; shouldTouch: boolean } | { valid: false; reason: "expired" | "idle" };

export function evaluateSession(
  session: { expires: Date; lastSeenAt: Date },
  now: number,
  policy: SessionPolicy,
): SessionCheck {
  if (session.expires.getTime() <= now) return { valid: false, reason: "expired" };
  if (now - session.lastSeenAt.getTime() >= policy.idleTimeoutMs) {
    return { valid: false, reason: "idle" };
  }
  return { valid: true, shouldTouch: now - session.lastSeenAt.getTime() >= policy.touchIntervalMs };
}

/** Cut-off times for removing dead sessions in bulk. */
export function sessionPurgeCutoffs(now: number, policy: SessionPolicy) {
  return { expiredBefore: new Date(now), idleSince: new Date(now - policy.idleTimeoutMs) };
}
