import { notFound } from "next/navigation";
import { MapPin, RotateCcw, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Price } from "@/components/shared/price";
import { ProductGrid } from "@/components/shared/product-grid";
import { RatingStars } from "@/components/shared/rating-stars";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { SectionHeading } from "@/components/shared/section-heading";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/routing";
import { localize, needsBengaliTranslation } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import {
  getCategoryBySlug,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  getReviewsForProduct,
  SIZE_GUIDES,
} from "@/modules/catalog/catalog.mock";
import { ProductGallery } from "./product-gallery";
import { ProductPurchasePanel } from "./product-purchase-panel";

type RouteParams = Promise<{ locale: string; slug: string }>;

/** Pre-render every product page in both locales. */
export function generateStaticParams() {
  return getProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { locale, slug } = await params;
  const product = getProductBySlug(slug);
  if (product === undefined) {
    const t = await getTranslations({ locale, namespace: "Product" });
    return { title: t("notFoundTitle") };
  }
  const resolved: Locale = locale === "bn" ? "bn" : "en";
  return {
    title: localize(product.name, resolved),
    description: localize(product.summary, resolved),
  };
}

export default async function ProductPage({ params }: { params: RouteParams }) {
  const { locale, slug } = await params;
  const product = getProductBySlug(slug);
  if (product === undefined) {
    notFound();
  }

  const resolvedLocale: Locale = locale === "bn" ? "bn" : "en";
  const t = await getTranslations({ locale, namespace: "Product" });
  const tShop = await getTranslations({ locale, namespace: "Shop" });

  const category = getCategoryBySlug(product.categorySlug);
  const related = getRelatedProducts(product, 4);
  const reviews = getReviewsForProduct(product.slug);
  const sizeGuide = SIZE_GUIDES[product.categorySlug];
  const isDenim = product.categorySlug === "denim-jeans";

  const name = localize(product.name, resolvedLocale);
  const showFallbackNote = resolvedLocale === "bn" && needsBengaliTranslation(product.name);

  const availabilityLabel =
    product.availability === "out_of_stock"
      ? t("outOfStock")
      : product.availability === "low_stock"
        ? t("lowStock")
        : t("inStock");

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs
        items={[
          { label: tShop("title"), href: "/shop" },
          ...(category === undefined
            ? []
            : [
                {
                  label: localize(category.name, resolvedLocale),
                  href: `/category/${category.slug}`,
                },
              ]),
          { label: name },
        ]}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          images={product.images.map((image) => ({
            src: image.src,
            alt: localize(image.alt, resolvedLocale),
          }))}
        />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.tags.includes("new") ? <Badge>{t("tagNew")}</Badge> : null}
            {product.tags.includes("bestseller") ? (
              <Badge variant="accent">{t("tagBestseller")}</Badge>
            ) : null}
            {product.tags.includes("sale") ? <Badge variant="muted">{t("tagSale")}</Badge> : null}
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <RatingStars rating={product.rating} reviewCount={product.reviewCount} size="md" />
            <span className="text-xs text-muted-foreground">
              {t("sku")}: <span className="tabular-nums">{product.sku}</span>
            </span>
          </div>

          <div className="mt-5">
            <Price
              pricePoisha={product.pricePoisha}
              {...(product.comparePricePoisha === undefined
                ? {}
                : { comparePricePoisha: product.comparePricePoisha })}
              size="lg"
            />
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {localize(product.summary, resolvedLocale)}
          </p>

          {showFallbackNote ? (
            <p className="mt-3 rounded-md border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {t("translationPending")}
            </p>
          ) : null}

          <p className="mt-5 text-sm">
            <span className="text-muted-foreground">{t("availability")}: </span>
            <span
              className={
                product.availability === "out_of_stock"
                  ? "font-medium text-destructive"
                  : "font-medium"
              }
            >
              {availabilityLabel}
            </span>
          </p>

          <div className="mt-8 border-t border-border pt-8">
            <ProductPurchasePanel
              productName={name}
              sizes={product.sizes}
              colours={product.colours.map((colour) => ({
                name: localize(colour.name, resolvedLocale),
                hex: colour.hex,
              }))}
              availability={product.availability}
              {...(isDenim ? { sizeLabel: `${t("sizeLabel")} (waist)` } : {})}
            />
          </div>

          {/* Delivery and returns summary */}
          <ul className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <Truck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("deliveryNote")}
            </li>
            <li className="flex items-start gap-2.5">
              <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("returnsNote")}
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("availableAtTitle")}: {product.availableAt.join(", ")}
              </span>
            </li>
          </ul>

          {/* Size guide */}
          <details className="mt-6 rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              {t("sizeGuide")}
            </summary>
            <div className="border-t border-border px-4 py-4">
              <h2 className="text-sm font-semibold">{t("sizeGuideTitle")}</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                    <th scope="col" className="py-2">
                      {t("sizeGuideSize")}
                    </th>
                    <th scope="col" className="py-2">
                      {isDenim ? "Waist" : t("sizeGuideChest")}
                    </th>
                    <th scope="col" className="py-2">
                      {isDenim ? "Hip" : t("sizeGuideShoulder")}
                    </th>
                    <th scope="col" className="py-2">
                      {isDenim ? "Inseam" : t("sizeGuideLength")}
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {sizeGuide.map((row) => (
                    <tr key={row.size} className="border-t border-border">
                      <th scope="row" className="py-2 text-left font-medium">
                        {row.size}
                      </th>
                      <td className="py-2">{row.chest}</td>
                      <td className="py-2">{row.shoulder}</td>
                      <td className="py-2">{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">{t("sizeGuideNote")}</p>
            </div>
          </details>
        </div>
      </div>

      {/* Details, fabric and care */}
      <section className="mt-16 grid gap-10 border-t border-border pt-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("descriptionTitle")}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            {product.description.map((paragraph) => (
              <p key={paragraph.en}>{localize(paragraph, resolvedLocale)}</p>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
              {t("fabricTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {localize(product.fabric, resolvedLocale)}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">{t("careTitle")}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              {product.care.map((item) => (
                <li key={item.en} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  {localize(item, resolvedLocale)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mt-16 border-t border-border pt-12">
        <SectionHeading title={t("reviewsTitle")} />
        {reviews.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : (
          <>
            <SampleContentNote messageKey="sampleReviews" className="mt-6 max-w-xl" />
            <ul className="mt-8 grid gap-6 md:grid-cols-2">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-lg border border-border bg-card p-6">
                  <div className="flex items-center justify-between gap-4">
                    <RatingStars rating={review.rating} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(review.date, resolvedLocale)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">
                    {localize(review.title, resolvedLocale)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {localize(review.body, resolvedLocale)}
                  </p>
                  <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {review.author} · {localize(review.city, resolvedLocale)}
                    </span>
                    {review.verifiedPurchase ? (
                      <Badge variant="outline">{t("verifiedPurchase")}</Badge>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Related products */}
      {related.length > 0 ? (
        <section className="mt-16 border-t border-border pt-12">
          <SectionHeading title={t("relatedTitle")} />
          <ProductGrid products={related} className="mt-10" />
        </section>
      ) : null}
    </div>
  );
}
