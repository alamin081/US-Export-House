/**
 * Opaque staff session tokens.
 *
 * Auth.js only supports JWT sessions with the Credentials provider, but the
 * spec requires sessions that can be revoked instantly. So the encrypted
 * Auth.js cookie carries nothing but this random token, and every request
 * checks it against the `Session` table.
 *
 * Only the SHA-256 of the token is stored. A copy of the database alone is not
 * enough to impersonate a signed-in staff member.
 */
import { createHash, randomBytes } from "node:crypto";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
