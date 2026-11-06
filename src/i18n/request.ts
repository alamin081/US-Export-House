import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

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

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
    timeZone: "Asia/Dhaka",
    now: new Date(),
  };
});
