import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the storefront.
 *
 * Bengali is the default language and is served without a prefix (`/`), while
 * English lives under `/en/...` (spec section 3.6). The admin dashboard stays
 * English-only for now and sits outside `[locale]`.
 */
export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
  localePrefix: "as-needed",
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

/** Human-readable language names, each written in its own language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  bn: "বাংলা",
  en: "English",
};

/** Used for `hreflang` and `Intl` APIs. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  bn: "bn-BD",
  en: "en-BD",
};
