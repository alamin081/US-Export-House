/**
 * Guest cart tokens — pure, so they can be unit-tested.
 *
 * The cookie holds `<token>.<signature>`: a random token plus an HMAC of it,
 * so a forged or truncated cookie is rejected before any database lookup.
 * The database stores only the SHA-256 of the token (`Cart.sessionToken`): a
 * copy of the database alone cannot be used to open someone's cart.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CART_COOKIE = "ueh_cart";

export function generateCartToken(): string {
  return randomBytes(32).toString("base64url");
}

function sign(token: string, secret: string): string {
  return createHmac("sha256", `cart-cookie:${secret}`).update(token).digest("base64url");
}

export function cartCookieValue(token: string, secret: string): string {
  return `${token}.${sign(token, secret)}`;
}

/** The token inside a cookie value, or null when the signature does not match. */
export function readCartCookie(value: string | undefined, secret: string): string | null {
  if (value === undefined || value.length > 200) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(token, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return token;
}

export function hashCartToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
