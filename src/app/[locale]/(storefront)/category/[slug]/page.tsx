import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaImage } from "@/components/shared/media-image";
import { ProductGrid } from "@/components/shared/product-grid";
import { localize } from "@/lib/content";
import { countArgs } from "@/lib/number";
import {
  getCategories,
  getCategoryBySlug,
  getProducts,
  isSortOption,
} from "@/modules/catalog/catalog.mock";
import { getPriceBucket, ProductFilters } from "../../shop/product-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type RouteParams = Promise<{ locale: string; slug: string }>;

/** Pre-render every category in both locales. */
export function generateStaticParams() {
  return getCategories().map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { locale, slug } = await params;
  const category = getCategoryBySlug(slug);
  if (category === undefined) {
    const t = await getTranslations({ locale, namespace: "Category" });
    return { title: t("notFoundTitle") };
  }
  return {
    title: localize(category.name, locale === "bn" ? "bn" : "en"),
    description: localize(category.description, locale === "bn" ? "bn" : "en"),
  };
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const category = getCategoryBySlug(slug);
  if (category === undefined) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Shop" });
  const resolvedLocale = locale === "bn" ? "bn" : "en";

  const sizes = all(query.size);
  const sortParam = first(query.sort);
  const priceParam = first(query.price);
  const bucket = getPriceBucket(priceParam);

  const products = getProducts({
    category: category.slug,
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(bucket?.minPoisha === undefined ? {} : { minPricePoisha: bucket.minPoisha }),
    ...(bucket?.maxPoisha === undefined ? {} : { maxPricePoisha: bucket.maxPoisha }),
    sort: isSortOption(sortParam) ? sortParam : "featured",
  });

  const filterState = {
    sizes,
    ...(priceParam === undefined ? {} : { price: priceParam }),
    sort: sortParam ?? "featured",
  };

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs
        items={[
          { label: t("title"), href: "/shop" },
          { label: localize(category.name, resolvedLocale) },
        ]}
      />

      {/* Category header */}
      <header className="mt-6 grid gap-8 border-b border-border pb-10 lg:grid-cols-[1fr_20rem] lg:items-center">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
            {localize(category.tagline, resolvedLocale)}
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {localize(category.name, resolvedLocale)}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {localize(category.description, resolvedLocale)}
          </p>
        </div>
        <MediaImage
          src={category.image}
          alt={localize(category.name, resolvedLocale)}
          ratio="wide"
          className="rounded-lg"
          sizes="(max-width: 1024px) 100vw, 20rem"
          priority
        />
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <aside>
          <details className="rounded-lg border border-border p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">{t("openFilters")}</summary>
            <div className="mt-5">
              <ProductFilters state={filterState} lockedCategory={category.slug} />
            </div>
          </details>
          <div className="hidden lg:block">
            <ProductFilters state={filterState} lockedCategory={category.slug} />
          </div>
        </aside>

        <section aria-label={localize(category.name, resolvedLocale)}>
          <p className="text-sm text-muted-foreground">
            {t("resultsCount", countArgs(products.length))}
          </p>

          {products.length === 0 ? (
            <EmptyState
              className="mt-8"
              title={t("noResultsTitle")}
              description={t("noResultsBody")}
              action={{ label: t("clearFilters"), href: `/category/${category.slug}` }}
            />
          ) : (
            <ProductGrid products={products} className="mt-8" priorityCount={4} />
          )}
        </section>
      </div>
    </div>
  );
}
