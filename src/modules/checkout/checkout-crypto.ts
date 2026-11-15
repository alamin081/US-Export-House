/**
 * Checkout hashing and the form timestamp — pure (the secret is passed in).
 *
 * Phones and IPs in CheckoutRejection and Order.placedIpHash are stored only
 * as keyed hashes: equal inputs give equal hashes (so limits and patterns
 * work), but the database alone cannot reveal the number or address.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function keyedHash(kind: "phone" | "ip", value: string, secret: string): string {
  return createHmac("sha256", `checkout-${kind}:${secret}`)
    .update(value)
    .digest("hex")
    .slice(0, 40);
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", `checkout-form:${secret}`).update(payload).digest("base64url");
}

/** Issued with the checkout page; proves when the form was shown. */
export function issueFormToken(issuedAtMs: number, secret: string): string {
  const payload = String(issuedAtMs);
  return `${payload}.${signature(payload, secret)}`;
}

/** The issue time, or null when the token was not issued by us. */
export function readFormToken(token: string, secret: string): number | null {
  const [payload, given] = token.split(".");
  if (payload === undefined || given === undefined || !/^\d{10,15}$/.test(payload)) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return Number(payload);
}

/** Unguessable token for the order confirmation URL. */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}
