/**
 * Number formatting for display.
 *
 * Business decision (Phase 3): numbers read with Latin digits in both
 * languages, so a count or a price looks the same on the Bengali and the
 * English storefront.
 *
 * ICU plural placeholders (`#` or a bare `{count}`) would be formatted with the
 * locale's own numbering system, which gives Bengali digits for `bn`. So any
 * number shown inside a translated string is pre-formatted here and passed as
 * a string, while the raw number is passed alongside only to pick the plural
 * branch.
 */
const DISPLAY_NUMBER_LOCALE = "en-BD";

export function formatCount(value: number): string {
  return new Intl.NumberFormat(DISPLAY_NUMBER_LOCALE).format(value);
}

/** Convenience for `t(key, countArgs(n))` in plural messages. */
export function countArgs(value: number): { count: number; countText: string } {
  return { count: value, countText: formatCount(value) };
}
