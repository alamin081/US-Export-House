/**
 * Lock ordering for multi-line stock work.
 *
 * Every transaction that touches several stock rows locks them in the same
 * global order — variantId, then locationId — so two transactions can never
 * wait on each other in a cycle (no deadlock). Ids are ASCII cuids and the
 * database uses the C collation, so JavaScript's string order matches
 * PostgreSQL's ORDER BY.
 */

export interface LevelKey {
  variantId: string;
  locationId: string;
}

export function levelKey(key: LevelKey): string {
  return `${key.variantId}|${key.locationId}`;
}

export function compareLevelKeys(a: LevelKey, b: LevelKey): number {
  if (a.variantId !== b.variantId) return a.variantId < b.variantId ? -1 : 1;
  if (a.locationId !== b.locationId) return a.locationId < b.locationId ? -1 : 1;
  return 0;
}

/** Unique keys in lock order. */
export function sortedUniqueKeys(keys: readonly LevelKey[]): LevelKey[] {
  const unique = new Map<string, LevelKey>();
  for (const key of keys) {
    unique.set(levelKey(key), { variantId: key.variantId, locationId: key.locationId });
  }
  return [...unique.values()].sort(compareLevelKeys);
}

/** Merges lines for the same stock row (quantities added) and sorts them. */
export function mergeLines<T extends LevelKey & { quantity: number }>(lines: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const line of lines) {
    const key = levelKey(line);
    const existing = merged.get(key);
    merged.set(
      key,
      existing === undefined
        ? { ...line }
        : { ...existing, quantity: existing.quantity + line.quantity },
    );
  }
  return [...merged.values()].sort(compareLevelKeys);
}
