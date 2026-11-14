import { hash } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";

import {
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "@/modules/access/password";

const GOOD = "correct horse battery staple";

describe("password hashing", () => {
  it("uses Argon2id with the OWASP parameters", async () => {
    const stored = await hashPassword(GOOD);
    expect(stored.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(stored).not.toContain(GOOD);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword(GOOD);
    expect(await verifyPassword(stored, GOOD)).toBe(true);
    expect(await verifyPassword(stored, "correct horse battery stapler")).toBe(false);
    expect(await verifyPassword(stored, "")).toBe(false);
  });

  it("salts every hash", async () => {
    const first = await hashPassword(GOOD);
    const second = await hashPassword(GOOD);
    expect(first).not.toBe(second);
  });

  it("fails closed on a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", GOOD)).toBe(false);
    expect(await verifyPassword("", GOOD)).toBe(false);
  });

  it("flags hashes made with weaker parameters for an upgrade", async () => {
    expect(needsRehash(await hashPassword(GOOD))).toBe(false);
    const weak = await hash(GOOD, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    expect(needsRehash(weak)).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });
});

describe("password policy", () => {
  it("requires at least 12 characters", () => {
    expect(checkPasswordPolicy("short-pass")).toContain("too_short");
    expect(checkPasswordPolicy("a-long-enough-pass")).toEqual([]);
  });

  it("caps the length so hashing cannot be abused", () => {
    expect(checkPasswordPolicy("x".repeat(129))).toContain("too_long");
  });

  it("rejects passwords containing the email name", () => {
    expect(checkPasswordPolicy("rahimuddin-2026!", "rahimuddin@example.com")).toContain(
      "contains_email",
    );
  });

  it("rejects the most common passwords", () => {
    expect(checkPasswordPolicy("Password1234")).toContain("too_common");
    expect(checkPasswordPolicy("usexporthouse")).toContain("too_common");
  });
});
