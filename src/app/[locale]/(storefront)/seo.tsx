import { clientEnv } from "@/config/env";
import type { Locale } from "@/i18n/routing";

/**
 * SEO helpers shared by the storefront pages: locale-aware paths (Bengali is
 * served without a prefix), absolute URLs for Open Graph, and JSON-LD.
 */

export function localePath(locale: Locale, path: string): string {
  return locale === "bn" ? path : `/en${path}`;
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, clientEnv.NEXT_PUBLIC_APP_URL).toString();
}

/** JSON-LD script. `<` is escaped so no string in the data can close the tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function breadcrumbJsonLd(
  locale: Locale,
  items: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(localePath(locale, item.path)),
    })),
  };
}

export function productJsonLd(input: {
  locale: Locale;
  path: string;
  name: string;
  description: string | null;
  images: readonly string[];
  sku: string | null;
  brand: string | null;
  minPricePoisha: number;
  maxPricePoisha: number;
}) {
  const price = (poisha: number) => (poisha / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description === null ? {} : { description: input.description }),
    image: input.images.map(absoluteUrl),
    ...(input.sku === null ? {} : { sku: input.sku }),
    ...(input.brand === null ? {} : { brand: { "@type": "Brand", name: input.brand } }),
    url: absoluteUrl(localePath(input.locale, input.path)),
    // Availability is left out until stock is managed (Phase 7).
    offers:
      input.minPricePoisha === input.maxPricePoisha
        ? {
            "@type": "Offer",
            priceCurrency: "BDT",
            price: price(input.minPricePoisha),
            url: absoluteUrl(localePath(input.locale, input.path)),
          }
        : {
            "@type": "AggregateOffer",
            priceCurrency: "BDT",
            lowPrice: price(input.minPricePoisha),
            highPrice: price(input.maxPricePoisha),
          },
  };
}
