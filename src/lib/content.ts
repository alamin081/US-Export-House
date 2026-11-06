import type { Locale } from "@/i18n/routing";

/**
 * Bilingual content.
 *
 * Business rule (confirmed in Phase 3): English copy is mandatory and Bengali
 * is optional. When a Bengali value is missing the English one is shown instead,
 * so a product is never blank on the Bengali storefront.
 *
 * The same shape becomes the database columns in Phase 4 (`nameEn`/`nameBn`,
 * `descriptionEn`/`descriptionBn`, ...), and the admin edits both languages.
 */
export interface LocalizedText {
  /** Required. */
  en: string;
  /** Optional; falls back to `en`. */
  bn?: string;
}

/** Resolve bilingual content for a locale, falling back to English. */
export function localize(text: LocalizedText, locale: Locale): string {
  if (locale === "bn") {
    return text.bn ?? text.en;
  }
  return text.en;
}

/** Resolve a list of bilingual paragraphs. */
export function localizeAll(items: readonly LocalizedText[], locale: Locale): string[] {
  return items.map((item) => localize(item, locale));
}

/**
 * True when the Bengali version is missing, so the admin UI can flag content
 * that still needs translating (Phase 6).
 */
export function needsBengaliTranslation(text: LocalizedText): boolean {
  return text.bn === undefined || text.bn.trim() === "";
}
