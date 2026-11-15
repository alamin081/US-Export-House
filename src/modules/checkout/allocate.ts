/** Discount splitting — pure and browser-safe (no Node imports). */

/**
 * Splits `discount` over the lines in proportion to their totals, in whole
 * poisha, so the shares always add up to exactly `discount` (largest
 * remainder; ties go to the earlier line). Lines not listed get 0.
 */
export function allocateDiscount(
  discount: number,
  lines: ReadonlyArray<{ key: string; total: number }>,
): Map<string, number> {
  const shares = new Map<string, number>(lines.map((line) => [line.key, 0]));
  const base = lines.reduce((sum, line) => sum + line.total, 0);
  if (discount <= 0 || base <= 0) return shares;
  const exact = lines.map((line, index) => {
    const raw = (discount * line.total) / base;
    return { key: line.key, index, floor: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let remainder = discount - exact.reduce((sum, item) => sum + item.floor, 0);
  for (const item of exact) shares.set(item.key, item.floor);
  const order = [...exact].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (remainder <= 0) break;
    shares.set(item.key, (shares.get(item.key) ?? 0) + 1);
    remainder -= 1;
  }
  return shares;
}
