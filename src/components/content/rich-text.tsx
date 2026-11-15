import { Fragment } from "react";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isExternalHref, parseInline } from "@/modules/content/inline";
import { fillPlaceholders, type PlaceholderValues } from "@/modules/content/placeholders";
import type { Localized } from "@/modules/content/content.schema";

/**
 * Content text on the storefront: Bengali with English fallback, settings
 * placeholders filled in, then **bold**, *italic* and [links] as elements.
 * Every piece is a React text child — never HTML — so nothing typed by an
 * editor can run in a visitor's browser.
 */
export function localText(text: Localized | null | undefined, locale: Locale): string {
  if (text === null || text === undefined) return "";
  return locale === "bn" && text.bn.trim() !== "" ? text.bn : text.en;
}

export function filledText(
  text: Localized | null | undefined,
  locale: Locale,
  values: PlaceholderValues,
): string {
  return fillPlaceholders(localText(text, locale), values, locale);
}

export function RichText({
  text,
  locale,
  values,
}: {
  text: Localized | null | undefined;
  locale: Locale;
  values: PlaceholderValues;
}) {
  const filled = filledText(text, locale, values);
  return (
    <>
      {parseInline(filled).map((token, index) => {
        switch (token.type) {
          case "bold":
            return <strong key={index}>{token.text}</strong>;
          case "italic":
            return <em key={index}>{token.text}</em>;
          case "link":
            // Site paths keep the visitor's language (/en/... for English).
            return token.href.startsWith("/") ? (
              <Link
                key={index}
                href={token.href}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {token.text}
              </Link>
            ) : (
              <a
                key={index}
                href={token.href}
                className="underline underline-offset-4 hover:text-foreground"
                {...(isExternalHref(token.href)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {token.text}
              </a>
            );
          default:
            return <Fragment key={index}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}
