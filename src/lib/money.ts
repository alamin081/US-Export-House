/**
 * Money helpers.
 *
 * Every amount in this system is an integer number of poisha (1 BDT = 100
 * poisha). Floating point money is never stored, passed around or summed.
 */
import { CURRENCY_SYMBOL, POISHA_PER_TAKA } from "@/config/constants";
import type { Locale } from "@/i18n/routing";

/** Branded integer type so a poisha amount cannot be mixed up with taka. */
export type Poisha = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertPoisha(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new MoneyError(`Poisha amounts must be integers, received ${amount}`);
  }
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(`Poisha amount out of safe integer range: ${amount}`);
  }
}

/** Convert a taka amount (e.g. from an admin form) to integer poisha. */
export function takaToPoisha(taka: number): Poisha {
  if (!Number.isFinite(taka)) {
    throw new MoneyError(`Invalid taka amount: ${taka}`);
  }
  return Math.round(taka * POISHA_PER_TAKA);
}

/** Convert poisha to a taka number. Use only for display or external APIs. */
export function poishaToTaka(poisha: Poisha): number {
  assertPoisha(poisha);
  return poisha / POISHA_PER_TAKA;
}

/** Sum poisha amounts safely. */
export function sumPoisha(amounts: readonly Poisha[]): Poisha {
  return amounts.reduce<Poisha>((total, amount) => {
    assertPoisha(amount);
    return total + amount;
  }, 0);
}

/** Multiply a unit price by a quantity. */
export function multiplyPoisha(unitPrice: Poisha, quantity: number): Poisha {
  assertPoisha(unitPrice);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, received ${quantity}`);
  }
  return unitPrice * quantity;
}

/**
 * Apply a percentage discount, rounding half-up to the nearest poisha.
 * Used by coupons; the rounding rule is applied in exactly one place.
 */
export function percentageOfPoisha(amount: Poisha, percentage: number): Poisha {
  assertPoisha(amount);
  if (percentage < 0 || percentage > 100) {
    throw new MoneyError(`Percentage must be between 0 and 100, received ${percentage}`);
  }
  return Math.round((amount * percentage) / 100);
}

export type NumeralSystem = "bengali" | "latin";

export interface FormatMoneyOptions {
  /**
   * Which digits to render. The business decided in Phase 3 to use Latin
   * digits in both languages (BDT 1,250 in Bengali and English alike), so
   * "bengali" is only kept for the rare case of a Bengali-digit print layout.
   */
  numerals?: NumeralSystem;
  /** Show poisha even when the amount is a whole number of taka. */
  showPoisha?: boolean;
}

/**
 * Digits per locale. Decided with the business: Latin digits everywhere, so a
 * price reads the same on the Bengali and the English storefront.
 */
export const DEFAULT_NUMERALS: Record<Locale, NumeralSystem> = {
  bn: "latin",
  en: "latin",
};

/**
 * Format a poisha amount for display, e.g. 125000 -> "BDT 1,250" with the
 * Bengali rupee mark and locale-appropriate digit grouping.
 */
export function formatMoney(
  poisha: Poisha,
  locale: Locale,
  options: FormatMoneyOptions = {},
): string {
  assertPoisha(poisha);

  const numerals = options.numerals ?? DEFAULT_NUMERALS[locale];
  const hasPoisha = poisha % POISHA_PER_TAKA !== 0;
  const fractionDigits = options.showPoisha === true || hasPoisha ? 2 : 0;

  // bn-BD renders Bengali digits and the Bengali grouping style; en-BD keeps
  // Latin digits with the same grouping.
  const intlLocale = numerals === "bengali" ? "bn-BD" : "en-BD";

  const formatted = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(poishaToTaka(poisha));

  return `${CURRENCY_SYMBOL}${formatted}`;
}

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Parse a taka amount typed into an admin form ("1250", "1,250.50", "১২৫০")
 * into integer poisha, without floating point. Returns null for anything that
 * is not a non-negative amount with at most two decimals.
 */
export function parseTakaInput(input: string): Poisha | null {
  const latin = input
    .trim()
    .replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)))
    .replace(/[,\s]/g, "")
    .replace(/^৳/, "");

  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(latin);
  if (match === null) return null;

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * POISHA_PER_TAKA + fraction;
}

/** The value an admin price field shows for a poisha amount: "1250" or "1250.50". */
export function formatTakaInput(poisha: Poisha): string {
  assertPoisha(poisha);
  const whole = Math.trunc(poisha / POISHA_PER_TAKA);
  const fraction = Math.abs(poisha % POISHA_PER_TAKA);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}
