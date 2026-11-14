/**
 * Redaction for audit payloads.
 *
 * Audit rows keep "before" and "after" snapshots of what changed. Anything
 * that looks like a secret is replaced before it reaches the database or a
 * log line, however deeply it is nested, so a careless caller cannot leak a
 * password hash or a session token into the audit trail.
 */
export const REDACTED = "[REDACTED]";

const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|hash|otp|code_?hash|api_?key|authorization|cookie|credential/i;

const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 2_000;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > MAX_DEPTH) return "[TRUNCATED]";

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSecretKey(key) ? REDACTED : sanitizeForAudit(nested, depth + 1);
    }
    return result;
  }

  // Functions, symbols: never meaningful in an audit row.
  return null;
}
