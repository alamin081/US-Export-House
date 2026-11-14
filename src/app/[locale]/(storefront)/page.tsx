import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MediaImage } from "@/components/shared/media-image";
import { NewsletterForm } from "@/components/shared/newsletter-form";
import { CollectionTile, ProductGrid } from "@/components/shared/product-grid";
import { SectionHeading } from "@/components/shared/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cachedHomeProducts } from "@/modules/catalog/storefront-catalog.cached";
import {
  MOCK_BRAND_INTRO,
  MOCK_COLLECTIONS,
  MOCK_HERO,
  MOCK_PROMO_BANNERS,
} from "@/modules/content/content.mock";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("homeTitle"), description: t("defaultDescription") };
}

/**
 * Home. Product rows and categories come from the database (cached by tag);
 * the hero, promos, collections and brand story are still the Phase 3 content
 * files until the content editor arrives (Phase 12).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = rawLocale === "bn" ? "bn" : "en";
  const t = await getTranslations({ locale, namespace: "Home" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });

  const { newArrivals, featured, categories } = await cachedHomeProducts();
  const [promoOne, promoTwo] = MOCK_PROMO_BANNERS;

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-border">
        <div className="site-container grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="order-2 lg:order-1">
            <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              {localize(MOCK_HERO.eyebrow, locale)}
            </p>
            <h1 className="mt-5 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {localize(MOCK_HERO.title, locale)}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              {localize(MOCK_HERO.subtitle, locale)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={MOCK_HERO.primaryHref} className={buttonVariants({ size: "lg" })}>
                {localize(MOCK_HERO.primaryCta, locale)}
              </Link>
              <Link
                href={MOCK_HERO.secondaryHref}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {localize(MOCK_HERO.secondaryCta, locale)}
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <MediaImage
              src={MOCK_HERO.image}
              alt={localize(MOCK_HERO.title, locale)}
              ratio="wide"
              className="rounded-lg"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- featured categories */}
      <section className="site-container py-16 lg:py-20">
        <SectionHeading
          eyebrow={t("categoriesEyebrow")}
          title={t("categoriesTitle")}
          description={t("categoriesDescription")}
        />

        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/category/${category.slug}`} className="group block">
                <MediaImage
                  src={category.imageUrl ?? "/images/categories/formal-shirts.svg"}
                  alt={localize(category.name, locale)}
                  ratio="product"
                  className="rounded-lg"
                  imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                <div className="mt-3.5">
                  <h3 className="text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                    {localize(category.name, locale)}
                  </h3>
                  {category.tagline === null ? null : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {localize(category.tagline, locale)}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* --------------------------------------------------------- new arrivals */}
      <section className="site-container pb-16 lg:pb-20">
        <SectionHeading
          title={t("newArrivalsTitle")}
          description={t("newArrivalsDescription")}
          action={{ label: tCommon("viewAll"), href: "/shop?sort=newest" }}
        />
        <ProductGrid products={newArrivals} className="mt-10" />
      </section>

      {/* ------------------------------------------------------- promo banner 1 */}
      {promoOne === undefined ? null : (
        <section className="site-container pb-16 lg:pb-20">
          <div className="grid items-center gap-8 overflow-hidden rounded-lg bg-accent/60 p-6 sm:p-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-[0.22em] text-accent-foreground/80 uppercase">
                {localize(promoOne.eyebrow, locale)}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {localize(promoOne.title, locale)}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-accent-foreground/80">
                {localize(promoOne.body, locale)}
              </p>
              <Link
                href={promoOne.href}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                {localize(promoOne.cta, locale)}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <MediaImage
              src={promoOne.image}
              alt={localize(promoOne.title, locale)}
              ratio="wide"
              className="rounded-md"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- best sellers */}
      <section className="site-container pb-16 lg:pb-20">
        <SectionHeading
          title={t("bestSellersTitle")}
          description={t("bestSellersDescription")}
          action={{ label: tCommon("viewAll"), href: "/shop" }}
        />
        <ProductGrid products={featured} className="mt-10" />
      </section>

      {/* ----------------------------------------------------------- collections */}
      <section className="site-container pb-16 lg:pb-20">
        <SectionHeading
          eyebrow={t("collectionsEyebrow")}
          title={t("collectionsTitle")}
          description={t("collectionsDescription")}
        />
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {MOCK_COLLECTIONS.map((collection) => (
            <li key={collection.id}>
              <CollectionTile
                title={localize(collection.title, locale)}
                description={localize(collection.description, locale)}
                meta={localize(collection.itemCountLabel, locale)}
                href={collection.href}
                image={collection.image}
                imageAlt={localize(collection.title, locale)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- brand intro */}
      <section className="border-y border-border bg-secondary/40">
        <div className="site-container grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <MediaImage
            src={MOCK_BRAND_INTRO.image}
            alt={localize(MOCK_BRAND_INTRO.title, locale)}
            ratio="wide"
            className="rounded-lg"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              {localize(MOCK_BRAND_INTRO.eyebrow, locale)}
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {localize(MOCK_BRAND_INTRO.title, locale)}
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              {MOCK_BRAND_INTRO.paragraphs.map((paragraph) => (
                <p key={paragraph.en}>{localize(paragraph, locale)}</p>
              ))}
            </div>

            <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-6">
              {MOCK_BRAND_INTRO.stats.map((stat) => (
                <div key={stat.value}>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {localize(stat.label, locale)}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>

            <Link
              href="/about"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              {t("brandIntroCta")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- promo banner 2 + newsletter */}
      <section className="site-container pb-20">
        <div className="grid gap-10 rounded-lg bg-primary p-8 text-primary-foreground sm:p-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("newsletterTitle")}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/80">
              {t("newsletterDescription")}
            </p>
            {promoTwo === undefined ? null : (
              <p className="mt-6 text-xs tracking-wide text-primary-foreground/70 uppercase">
                {localize(promoTwo.title, locale)}
              </p>
            )}
          </div>
          <div className="lg:justify-self-end">
            <NewsletterForm tone="dark" />
          </div>
        </div>
      </section>
    </>
  );
}
