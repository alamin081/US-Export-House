import { describe, expect, it } from "vitest";

import { throttleKey } from "@/modules/access/login-throttle";
import {
  evaluateSession,
  sessionPolicyFrom,
  sessionPurgeCutoffs,
} from "@/modules/access/session-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);

/** Defaults from .env.example: 8 h idle, 7 days absolute. */
const policy = sessionPolicyFrom({ idleTimeoutMinutes: 8 * 60, maxAgeHours: 7 * 24 });

const session = (expiresIn: number, lastSeenAgo: number) => ({
  expires: new Date(NOW + expiresIn),
  lastSeenAt: new Date(NOW - lastSeenAgo),
});

describe("staff session policy", () => {
  it("converts the configured settings", () => {
    expect(policy.idleTimeoutMs).toBe(8 * HOUR);
    expect(policy.maxAgeMs).toBe(7 * 24 * HOUR);
  });

  it("keeps a recently used session without writing", () => {
    expect(evaluateSession(session(HOUR, MINUTE), NOW, policy)).toEqual({
      valid: true,
      shouldTouch: false,
    });
  });

  it("refreshes lastSeenAt once the touch interval has passed", () => {
    expect(evaluateSession(session(HOUR, 6 * MINUTE), NOW, policy)).toEqual({
      valid: true,
      shouldTouch: true,
    });
  });

  it("ends a session idle for the timeout", () => {
    expect(evaluateSession(session(48 * HOUR, 8 * HOUR), NOW, policy)).toEqual({
      valid: false,
      reason: "idle",
    });
  });

  it("ends an active session at its absolute expiry", () => {
    expect(evaluateSession(session(0, MINUTE), NOW, policy)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("purges by absolute expiry and by idle cut-off", () => {
    const cutoffs = sessionPurgeCutoffs(NOW, policy);
    expect(cutoffs.expiredBefore.getTime()).toBe(NOW);
    expect(cutoffs.idleSince.getTime()).toBe(NOW - 8 * HOUR);
  });
});

describe("throttle keys", () => {
  it("never store the email or IP in clear", () => {
    const key = throttleKey("email", "staff@usexporthouse.com");
    expect(key).toMatch(/^email:[a-f0-9]{64}$/);
    expect(key).not.toContain("usexporthouse");
    expect(throttleKey("ip", "203.0.113.9")).not.toContain("203.0.113.9");
  });

  it("separate emails from IPs with the same text", () => {
    expect(throttleKey("email", "x")).not.toBe(throttleKey("ip", "x"));
  });
});
