import { useTranslations } from "next-intl";

import type { NumeralSystem } from "@/lib/money";

/**
 * Digits for prices and counts, from the `storefront.numerals` setting
 * (default "latin", decided with the business). The value travels as the
 * `Settings.numerals` message, so it works in server and client components.
 */
export function useNumerals(): NumeralSystem {
  const t = useTranslations("Settings");
  return t("numerals") === "bengali" ? "bengali" : "latin";
}
