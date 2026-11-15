import { describe, expect, it } from "vitest";

import {
  generatePublicToken,
  issueFormToken,
  keyedHash,
  readFormToken,
} from "@/modules/checkout/checkout-crypto";

const SECRET = "s".repeat(40);

describe("keyedHash", () => {
  it("is stable for one value and never contains it", () => {
    const first = keyedHash("phone", "+8801712345678", SECRET);
    expect(keyedHash("phone", "+8801712345678", SECRET)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(first).not.toContain("1712345678");
  });

  it("differs by kind and by secret", () => {
    const phone = keyedHash("phone", "1.2.3.4", SECRET);
    expect(keyedHash("ip", "1.2.3.4", SECRET)).not.toBe(phone);
    expect(keyedHash("phone", "1.2.3.4", "t".repeat(40))).not.toBe(phone);
  });
});

describe("form token", () => {
  it("round-trips the issue time", () => {
    const now = 1_763_200_000_000;
    expect(readFormToken(issueFormToken(now, SECRET), SECRET)).toBe(now);
  });

  it("rejects a forged time, a foreign secret and garbage", () => {
    const token = issueFormToken(1_763_200_000_000, SECRET);
    const signature = token.split(".")[1];
    expect(readFormToken(`1763100000000.${signature}`, SECRET)).toBeNull();
    expect(readFormToken(token, "t".repeat(40))).toBeNull();
    expect(readFormToken("not-a-token", SECRET)).toBeNull();
    expect(readFormToken("", SECRET)).toBeNull();
  });
});

describe("public token", () => {
  it("is long, URL-safe and different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, generatePublicToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
