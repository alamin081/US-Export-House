import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { cachedCatalogSettings } from "@/modules/catalog/storefront-catalog.cached";
import { DEFAULT_CATALOG_SETTINGS } from "@/modules/settings/catalog-settings";
import { routing } from "./routing";

/** The `storefront.numerals` setting, carried to components as a message. */
async function numeralsSetting(): Promise<string> {
  try {
    return (await cachedCatalogSettings()).numerals;
  } catch {
    return DEFAULT_CATALOG_SETTINGS.numerals;
  }
}

/**
 * Per-request i18n configuration.
 *
 * `next/root-params` lets statically rendered pages read the matched locale
 * without threading it through every layout (available by default in Next 16.3+).
 */
export default getRequestConfig(async ({ locale }) => {
  let resolvedLocale = locale;

  if (!resolvedLocale) {
    const paramValue = await rootParams.locale();
    if (hasLocale(routing.locales, paramValue)) {
      resolvedLocale = paramValue;
    } else {
      notFound();
    }
  }

  const messages = (await import(`./messages/${resolvedLocale}.json`)).default;

  return {
    locale: resolvedLocale,
    // Settings.numerals is read by Price and counts on both server and client.
    messages: { ...messages, Settings: { numerals: await numeralsSetting() } },
    timeZone: "Asia/Dhaka",
    now: new Date(),
  };
});
