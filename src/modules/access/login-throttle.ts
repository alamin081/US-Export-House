/**
 * Sign-in throttling decision — pure, so it is unit-tested without a database.
 *
 * State lives in the `AuthThrottle` table (PostgreSQL), not in memory, so the
 * limit holds on serverless hosting where every request may land on a
 * different instance. Before the password is checked, the auth service
 * atomically increments one counter per email and one per IP
 * (INSERT … ON CONFLICT DO UPDATE … RETURNING), which serialises parallel
 * attempts on the row lock: of N simultaneous guesses, only the first
 * `maxFailuresPerEmail` ever reach Argon2. A successful sign-in gives its
 * reservation back, so the counters measure failures (plus attempts in
 * flight) within a fixed window.
 */
import { createHash } from "node:crypto";

import { AUTH_POLICY } from "@/config/constants";

export interface ThrottleCounts {
  /** Failed attempts already in the window, not counting the current one. */
  failuresForEmail: number;
  failuresForIp: number;
}

export interface ThrottlePolicy {
  maxFailuresPerEmail: number;
  maxFailuresPerIp: number;
}

export type ThrottleDecision =
  { allowed: true } | { allowed: false; reason: "email_locked" | "ip_locked" };

export const DEFAULT_THROTTLE_POLICY: ThrottlePolicy = {
  maxFailuresPerEmail: AUTH_POLICY.maxFailuresPerEmail,
  maxFailuresPerIp: AUTH_POLICY.maxFailuresPerIp,
};

export function evaluateLoginThrottle(
  counts: ThrottleCounts,
  policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY,
): ThrottleDecision {
  if (counts.failuresForEmail >= policy.maxFailuresPerEmail) {
    return { allowed: false, reason: "email_locked" };
  }
  if (counts.failuresForIp >= policy.maxFailuresPerIp) {
    return { allowed: false, reason: "ip_locked" };
  }
  return { allowed: true };
}

/**
 * Counter key. Hashed so the table holds no email addresses or IPs in clear;
 * the audit log already records those where they are needed.
 */
export function throttleKey(kind: "email" | "ip", value: string): string {
  return `${kind}:${createHash("sha256").update(value).digest("hex")}`;
}
