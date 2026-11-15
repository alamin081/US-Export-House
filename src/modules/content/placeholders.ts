/**
 * Numbers inside content text come from settings, so changing a setting
 * changes every banner and page that mentions it. Pure.
 *
 *   "Free delivery over {freeShippingThreshold}" -> "Free delivery over ৳2,500"
 *
 * Square-bracket notes such as "[Write your brand story here]" mark text the
 * owner still has to write; they may not go live in production.
 */
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";

export const PLACEHOLDERS = [
  "freeShippingThreshold",
  "returnWindowDays",
  "storePhone",
  "codMaxTotal",
] as const;
export type PlaceholderKey = (typeof PLACEHOLDERS)[number];

export const PLACEHOLDER_HELP: Record<PlaceholderKey, string> = {
  freeShippingThreshold: "Free delivery from this order value (Settings ▸ Delivery)",
  returnWindowDays: "Days to return an item (Settings ▸ Returns)",
  storePhone: "Shop phone number (Settings ▸ Store information)",
  codMaxTotal: "Largest order paid by cash on delivery (Settings ▸ Checkout)",
};

export interface PlaceholderValues {
  freeShippingThresholdPoisha: number;
  returnWindowDays: number;
  storePhone: string;
  codMaxTotalPoisha: number;
}

const PATTERN = /\{([A-Za-z]+)\}/g;

export function unknownPlaceholders(text: string): string[] {
  const known: readonly string[] = PLACEHOLDERS;
  return [...text.matchAll(PATTERN)]
    .map((match) => match[1]!)
    .filter((name) => !known.includes(name));
}

export function fillPlaceholders(text: string, values: PlaceholderValues, locale: Locale): string {
  return text.replace(PATTERN, (whole, name: string) => {
    switch (name) {
      case "freeShippingThreshold":
        return formatMoney(values.freeShippingThresholdPoisha, locale, { numerals: "latin" });
      case "codMaxTotal":
        return formatMoney(values.codMaxTotalPoisha, locale, { numerals: "latin" });
      case "returnWindowDays":
        return String(values.returnWindowDays);
      case "storePhone":
        return values.storePhone;
      default:
        return whole;
    }
  });
}

// "[note]" not followed by "(" — a markdown link is [label](url).
const TODO_NOTE = /\[[^\]\n]{2,}\](?!\()/;

/** True when the text still contains a "[write this]" note. */
export function hasTodoNote(text: string): boolean {
  return TODO_NOTE.test(text);
}
