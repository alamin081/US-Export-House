import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RotateCcw, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Price } from "@/components/shared/price";
import { ProductGrid } from "@/components/shared/product-grid";
import { SectionHeading } from "@/components/shared/section-heading";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/routing";
import { localize, needsBengaliTranslation } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import {
  cachedCatalogSettings,
  cachedProductPage,
  cachedPublishedSlugs,
} from "@/modules/catalog/storefront-catalog.cached";
import { absoluteUrl, breadcrumbJsonLd, JsonLd, localePath, productJsonLd } from "../../seo";
import { ProductGallery } from "./product-gallery";
import { ProductPurchasePanel } from "./product-purchase-panel";
import { ProductSelectionProvider } from "./product-selection";

type RouteParams = Promise<{ locale: string; slug: string }>;

/**
 * ISR: pre-rendered and refreshed by cache tag the moment the admin saves.
 * This interval (= STOREFRONT_REVALIDATE_SECONDS) is only the fallback.
 */
export const revalidate = 3600;

/** Pre-render every published product in both locales; new ones render on demand. */
export async function generateStaticParams() {
  const slugs = await cachedPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

function resolve(locale: string): Locale {
  return locale === "bn" ? "bn" : "en";
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await cachedProductPage(slug);
  if (product === null) {
    const t = await getTranslations({ locale, namespace: "Product" });
    return { title: t("notFoundTitle"), robots: { index: false } };
  }

  const resolved = resolve(locale);
  const { numerals } = await cachedCatalogSettings();
  const path = `/product/${product.slug}`;
  const name = localize(product.name, resolved);
  const price = formatMoney(product.minPricePoisha, resolved, { numerals });
  const summary =
    product.seoDescription !== null
      ? localize(product.seoDescription, resolved)
      : product.summary !== null
        ? localize(product.summary, resolved)
        : null;
  const description = summary === null ? price : `${price} · ${summary}`;
  const image = product.images[0];

  return {
    title: product.seoTitle === null ? name : localize(product.seoTitle, resolved),
    description,
    alternates: {
      canonical: localePath(resolved, path),
      languages: { "bn-BD": path, "en-BD": `/en${path}`, "x-default": path },
    },
    openGraph: {
      type: "website",
      title: `${name} — ${price}`,
      description,
      url: localePath(resolved, path),
      locale: resolved === "bn" ? "bn_BD" : "en_BD",
      ...(image === undefined
        ? {}
        : { images: [{ url: absoluteUrl(image.url), alt: localize(image.alt, resolved) }] }),
    },
    other: {
      "product:price:amount": (product.minPricePoisha / 100).toFixed(2),
      "product:price:currency": "BDT",
    },
  };
}

export default async function ProductPage({ params }: { params: RouteParams }) {
  const { locale, slug } = await params;
  const product = await cachedProductPage(slug);
  // Draft, archived, deleted or unknown: 404.
  if (product === null) notFound();

  const resolvedLocale = resolve(locale);
  const t = await getTranslations({ locale, namespace: "Product" });
  const tShop = await getTranslations({ locale, namespace: "Shop" });
  const name = localize(product.name, resolvedLocale);
  const showFallbackNote = resolvedLocale === "bn" && needsBengaliTranslation(product.name);
  const path = `/product/${product.slug}`;
  const firstColour = product.colours[0]?.id ?? null;

  return (
    <div className="site-container py-10 lg:py-14">
      <JsonLd
        data={productJsonLd({
          locale: resolvedLocale,
          path,
          name,
          description: product.summary === null ? null : localize(product.summary, resolvedLocale),
          images: product.images.map((image) => image.url),
          sku: product.variants.length === 1 ? (product.variants[0]?.sku ?? null) : null,
          brand: product.brand === null ? null : localize(product.brand, resolvedLocale),
          minPricePoisha: product.minPricePoisha,
          maxPricePoisha: product.maxPricePoisha,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd(resolvedLocale, [
          { name: tShop("title"), path: "/shop" },
          ...product.breadcrumbs.map((crumb) => ({
            name: localize(crumb.name, resolvedLocale),
            path: `/category/${crumb.slug}`,
          })),
          { name, path },
        ])}
      />

      <Breadcrumbs
        items={[
          { label: tShop("title"), href: "/shop" },
          ...product.breadcrumbs.map((crumb) => ({
            label: localize(crumb.name, resolvedLocale),
            href: `/category/${crumb.slug}`,
          })),
          { label: name },
        ]}
      />

      <ProductSelectionProvider initialColourId={firstColour}>
        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <ProductGallery
            images={product.images.map((image) => ({
              src: image.url,
              alt: localize(image.alt, resolvedLocale),
              colourId: image.colourId,
            }))}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {product.isNew ? <Badge>{t("tagNew")}</Badge> : null}
              {product.isBestseller ? <Badge variant="accent">{t("tagBestseller")}</Badge> : null}
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>

            <div className="mt-4">
              <Price
                pricePoisha={product.minPricePoisha}
                from={product.minPricePoisha !== product.maxPricePoisha}
                size="md"
              />
            </div>

            {product.summary === null ? null : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {localize(product.summary, resolvedLocale)}
              </p>
            )}

            {showFallbackNote ? (
              <p className="mt-3 rounded-md border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                {t("translationPending")}
              </p>
            ) : null}

            <div className="mt-8 border-t border-border pt-8">
              <ProductPurchasePanel
                sizes={product.sizes.map((size) => ({
                  id: size.id,
                  label: localize(size.label, resolvedLocale),
                  hex: null,
                }))}
                colours={product.colours.map((colour) => ({
                  id: colour.id,
                  label: localize(colour.label, resolvedLocale),
                  hex: colour.hex,
                }))}
                variants={product.variants}
              />
            </div>

            <ul className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Truck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t("deliveryNote")}
              </li>
              <li className="flex items-start gap-2.5">
                <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t("returnsNote")}
              </li>
            </ul>

            {product.sizeChart === null ? null : (
              <details className="mt-6 rounded-lg border border-border" data-testid="size-guide">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  {t("sizeGuide")}
                </summary>
                <div className="overflow-x-auto border-t border-border px-4 py-4">
                  <h2 className="text-sm font-semibold">
                    {localize(product.sizeChart.name, resolvedLocale)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.sizeChart.unit === "CM"
                      ? t("sizeGuideUnitCm")
                      : t("sizeGuideUnitInch")}
                  </p>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <th scope="col" className="py-2">
                          {t("sizeGuideSize")}
                        </th>
                        {product.sizeChart.columns.map((column) => (
                          <th key={column.en} scope="col" className="py-2">
                            {localize(column, resolvedLocale)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {product.sizeChart.rows.map((row) => (
                        <tr key={row.size} className="border-t border-border">
                          <th scope="row" className="py-2 text-left font-medium">
                            {row.size}
                          </th>
                          {row.values.map((value, index) => (
                            <td key={index} className="py-2">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {product.sizeChart.note === null
                      ? t("sizeGuideNote")
                      : localize(product.sizeChart.note, resolvedLocale)}
                  </p>
                </div>
              </details>
            )}
          </div>
        </div>
      </ProductSelectionProvider>

      <section className="mt-16 grid gap-10 border-t border-border pt-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("descriptionTitle")}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            {product.description.map((paragraph, index) => (
              <p key={index}>{localize(paragraph, resolvedLocale)}</p>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {product.fabric === null ? null : (
            <div>
              <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
                {t("fabricTitle")}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {localize(product.fabric, resolvedLocale)}
              </p>
            </div>
          )}
          {product.fit === null ? null : (
            <div>
              <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">{t("fitTitle")}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {localize(product.fit, resolvedLocale)}
              </p>
            </div>
          )}
          {product.care.length === 0 ? null : (
            <div>
              <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
                {t("careTitle")}
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {product.care.map((item, index) => (
                  <li key={index} className="flex gap-2">
                    <span aria-hidden="true">·</span>
                    {localize(item, resolvedLocale)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {product.related.length > 0 ? (
        <section className="mt-16 border-t border-border pt-12">
          <SectionHeading title={t("relatedTitle")} />
          <ProductGrid products={product.related} className="mt-10" />
        </section>
      ) : null}
    </div>
  );
}
