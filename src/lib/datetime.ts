import type { Locale } from "@/i18n/routing";

/**
 * Date formatting.
 *
 * Bangladesh Standard Time is the only business timezone, and dates use Latin
 * digits in both languages to match the number formatting decision.
 */
const TIME_ZONE = "Asia/Dhaka";

const INTL_LOCALE: Record<Locale, string> = {
  // `-u-nu-latn` forces Latin digits for the Bengali locale.
  bn: "bn-BD-u-nu-latn",
  en: "en-GB",
};

/** e.g. "6 Nov 2026" */
export function formatDate(date: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(date));
}

/** e.g. "6 Nov 2026, 14:05" */
export function formatDateTime(date: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(date));
}
