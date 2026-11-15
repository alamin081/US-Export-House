import { getTranslations } from "next-intl/server";

import { HomeSections } from "@/components/content/home-sections";
import { MediaImage } from "@/components/shared/media-image";
import { ProductGrid } from "@/components/shared/product-grid";
import { SectionHeading } from "@/components/shared/section-heading";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cachedHomeProducts } from "@/modules/catalog/storefront-catalog.cached";
import {
  cachedContentSettings,
  contentNow,
  loadContent,
} from "@/modules/content/content.storefront";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("homeTitle"), description: t("defaultDescription") };
}

/**
 * Home. Every section — hero slides, category tiles, product rows, promos,
 * collections, the brand story and trust badges — comes from the content
 * editor (Phase 12). Until a home page is published, a plain layout of real
 * categories and new products is shown, with no marketing copy at all.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = rawLocale === "bn" ? "bn" : "en";
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const [home, settings, now] = await Promise.all([
    loadContent("home", "HOME"),
    cachedContentSettings(),
    contentNow(),
  ]);

  if (home !== null) {
    return (
      <HomeSections
        sections={home.sections}
        locale={locale}
        values={settings.placeholders}
        viewAll={tCommon("viewAll")}
        now={now}
      />
    );
  }

  const t = await getTranslations({ locale, namespace: "Home" });
  const { newArrivals, categories } = await cachedHomeProducts();
  return (
    <div data-testid="home-fallback">
      <section className="site-container py-16 lg:py-20">
        <SectionHeading title={t("categoriesTitle")} />
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/category/${category.slug}`} className="group block">
                <MediaImage
                  src={category.imageUrl ?? "/images/categories/formal-shirts.svg"}
                  alt={localize(category.name, locale)}
                  ratio="product"
                  className="rounded-lg"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                <h3 className="mt-3.5 text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                  {localize(category.name, locale)}
                </h3>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="site-container pb-16 lg:pb-20">
        <SectionHeading
          title={t("newArrivalsTitle")}
          action={{ label: tCommon("viewAll"), href: "/shop?sort=newest" }}
        />
        <ProductGrid products={newArrivals} className="mt-10" />
      </section>
    </div>
  );
}
