import { describe, expect, it } from "vitest";

import { AUTH_POLICY } from "@/config/constants";
import { loginSchema, safeAdminCallback } from "@/modules/access/access.schema";
import { evaluateLoginThrottle } from "@/modules/access/login-throttle";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import { generateSessionToken, hashSessionToken } from "@/modules/access/session-token";
import { REDACTED, sanitizeForAudit } from "@/modules/audit/sanitize";

describe("sign-in throttling", () => {
  it("allows attempts below both limits", () => {
    expect(evaluateLoginThrottle({ failuresForEmail: 4, failuresForIp: 19 })).toEqual({
      allowed: true,
    });
  });

  it(`locks an email after ${AUTH_POLICY.maxFailuresPerEmail} failures`, () => {
    expect(
      evaluateLoginThrottle({
        failuresForEmail: AUTH_POLICY.maxFailuresPerEmail,
        failuresForIp: 0,
      }),
    ).toEqual({ allowed: false, reason: "email_locked" });
  });

  it(`locks an IP after ${AUTH_POLICY.maxFailuresPerIp} failures`, () => {
    expect(
      evaluateLoginThrottle({ failuresForEmail: 0, failuresForIp: AUTH_POLICY.maxFailuresPerIp }),
    ).toEqual({ allowed: false, reason: "ip_locked" });
  });
});

describe("session tokens", () => {
  it("are long, random and URL-safe", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are stored only as a SHA-256 digest", () => {
    const token = generateSessionToken();
    const digest = hashSessionToken(token);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashSessionToken(token)).toBe(digest);
  });
});

describe("sign-in input", () => {
  it("normalises the email", () => {
    const parsed = loginSchema.parse({ email: "  Admin@UsExportHouse.com ", password: "x" });
    expect(parsed.email).toBe("admin@usexporthouse.com");
  });

  it("rejects malformed input", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(200) }).success).toBe(
      false,
    );
  });
});

describe("post-login redirect", () => {
  it("keeps admin paths", () => {
    expect(safeAdminCallback("/admin/staff")).toBe("/admin/staff");
    expect(safeAdminCallback("/admin")).toBe("/admin");
  });

  it("refuses open redirects and non-admin targets", () => {
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "/admin\\..\\evil",
      "/shop",
      "javascript:alert(1)",
      "/admin/login",
      undefined,
      42,
    ]) {
      expect(safeAdminCallback(hostile)).toBe("/admin");
    }
  });
});

describe("request metadata", () => {
  it("takes the client IP from the first forwarded entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "Mozilla/5.0",
    });
    expect(requestMetaFromHeaders(headers)).toEqual({
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
    });
  });

  it("falls back to x-real-ip, then to null", () => {
    expect(requestMetaFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" })).ip).toBe(
      "198.51.100.4",
    );
    expect(requestMetaFromHeaders(new Headers()).ip).toBeNull();
  });

  it("truncates oversized values", () => {
    const meta = requestMetaFromHeaders(new Headers({ "user-agent": "x".repeat(1000) }));
    expect(meta.userAgent?.length).toBe(300);
  });
});

describe("audit redaction", () => {
  it("redacts secrets however they are named or nested", () => {
    const sanitized = sanitizeForAudit({
      email: "staff@example.test",
      password: "hunter2-hunter2",
      passwordHash: "$argon2id$...",
      nested: { sessionToken: "abc", apiKey: "k", note: "kept" },
      list: [{ newPassword: "x", role: "Order Staff" }],
    });

    expect(sanitized).toEqual({
      email: "staff@example.test",
      password: REDACTED,
      passwordHash: REDACTED,
      nested: { sessionToken: REDACTED, apiKey: REDACTED, note: "kept" },
      list: [{ newPassword: REDACTED, role: "Order Staff" }],
    });
  });

  it("never lets a secret value survive serialisation", () => {
    const output = JSON.stringify(
      sanitizeForAudit({ currentPassword: "s3cret-value-123", otpCodeHash: "zz" }),
    );
    expect(output).not.toContain("s3cret-value-123");
    expect(output).not.toContain("zz");
  });

  it("normalises dates and caps long strings", () => {
    const sanitized = sanitizeForAudit({
      at: new Date("2026-11-14T00:00:00Z"),
      text: "y".repeat(5000),
    }) as { at: string; text: string };
    expect(sanitized.at).toBe("2026-11-14T00:00:00.000Z");
    expect(sanitized.text.length).toBeLessThan(2100);
  });
});
