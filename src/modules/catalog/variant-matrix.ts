/**
 * Variant matrix generator: every size x colour combination the admin picked,
 * minus the ones they untick. Pure, so the admin form and the server agree.
 */

export interface MatrixValue {
  /** Stable id of the value inside the form (preset id or existing value id). */
  ref: string;
  code: string;
}

export interface MatrixCell {
  /** Form key for the combination, e.g. "size:L|colour:NVY". */
  key: string;
  size: MatrixValue | null;
  colour: MatrixValue | null;
}

export function combinationKey(size: MatrixValue | null, colour: MatrixValue | null): string {
  return [
    size === null ? null : `size:${size.ref}`,
    colour === null ? null : `colour:${colour.ref}`,
  ]
    .filter((part): part is string => part !== null)
    .join("|");
}

/**
 * All combinations, size-major (S/Navy, S/White, M/Navy, ...). With only sizes
 * or only colours selected, one dimension is simply absent; with neither, a
 * single option-less cell is returned.
 */
export function generateMatrix(
  sizes: readonly MatrixValue[],
  colours: readonly MatrixValue[],
  excludedKeys: ReadonlySet<string> = new Set(),
): MatrixCell[] {
  const sizeAxis: Array<MatrixValue | null> = sizes.length === 0 ? [null] : [...sizes];
  const colourAxis: Array<MatrixValue | null> = colours.length === 0 ? [null] : [...colours];

  const cells: MatrixCell[] = [];
  for (const size of sizeAxis) {
    for (const colour of colourAxis) {
      const key = combinationKey(size, colour);
      if (!excludedKeys.has(key)) cells.push({ key, size, colour });
    }
  }
  return cells;
}

/**
 * Database key of a combination: sorted option value ids joined with "+".
 * Matches the B2 backfill SQL, which aggregates in the same order.
 */
export function optionKeyOf(optionValueIds: readonly string[]): string {
  return [...optionValueIds].sort().join("+");
}

/** Keys that occur more than once. */
export function duplicateKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
