/**
 * Showing audit entries — pure. Phone numbers are masked wherever they
 * appear (017•••••789), and before/after snapshots become a field-by-field
 * difference. Secrets were already replaced by [REDACTED] when written.
 */

const BD_PHONE = /(?:\+?880|0)1[3-9]\d{8}|(?<!\d)01[3-9][\d -]{8,10}\d(?!\d)/g;

export function maskPhone(text: string): string {
  return text.replace(BD_PHONE, (match) => {
    const digits = match.replace(/\D/g, "");
    const local = digits.slice(-11);
    if (local.length < 11) return match;
    return `${local.slice(0, 3)}•••••${local.slice(-3)}`;
  });
}

/** Masks phone numbers in every string of a JSON value. */
export function maskPhones(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (typeof value === "string") return maskPhone(value);
  if (Array.isArray(value)) return value.map((item) => maskPhones(item, depth + 1));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, maskPhones(nested, depth + 1)]),
    );
  }
  return value;
}

export interface AuditDiffRow {
  path: string;
  before: string | null;
  after: string | null;
  change: "added" | "removed" | "changed" | "same";
}

function flatten(value: unknown, prefix: string, out: Map<string, string>, depth: number) {
  if (value === null || value === undefined) return;
  if (typeof value === "object" && !Array.isArray(value) && depth < 3) {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix === "" ? key : `${prefix}.${key}`, out, depth + 1);
    }
    return;
  }
  out.set(
    prefix === "" ? "(value)" : prefix,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

/** Field-by-field difference between two snapshots (already masked). */
export function auditDiff(before: unknown, after: unknown): AuditDiffRow[] {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  flatten(before, "", left, 0);
  flatten(after, "", right, 0);
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  return paths.map((path) => {
    const a = left.get(path) ?? null;
    const b = right.get(path) ?? null;
    return {
      path,
      before: a,
      after: b,
      change: a === null ? "added" : b === null ? "removed" : a === b ? "same" : "changed",
    };
  });
}
