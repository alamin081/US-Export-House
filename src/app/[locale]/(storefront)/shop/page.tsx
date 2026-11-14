import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductGrid } from "@/components/shared/product-grid";
import { countArgs } from "@/lib/number";
import { cachedActiveCategories, cachedListing } from "@/modules/catalog/storefront-catalog.cached";
import { filterStateFrom, ListingPagination, ProductFilters } from "./product-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("shopTitle"),
    alternates: {
      canonical: locale === "bn" ? "/shop" : "/en/shop",
      languages: { "bn-BD": "/shop", "en-BD": "/en/shop", "x-default": "/shop" },
    },
  };
}

/** All products, with search (names and tags, both languages) and filters. */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "Shop" });
  const state = filterStateFrom(query);

  const [listing, categories] = await Promise.all([
    cachedListing({
      ...(state.category === undefined ? {} : { categorySlug: state.category }),
      ...(state.q === undefined ? {} : { q: state.q }),
      sizes: [...state.sizes],
      colours: [...state.colours],
      brands: [...state.brands],
      ...(state.min === undefined ? {} : { minTaka: state.min }),
      ...(state.max === undefined ? {} : { maxTaka: state.max }),
      sort: state.sort,
      page: state.page,
    }),
    cachedActiveCategories(),
  ]);
  const products = listing?.products ?? [];
  const total = listing?.total ?? 0;
  const facets = listing?.facets ?? { sizes: [], colours: [], brands: [] };
  const topCategories = categories.filter((category) => category.parentId === null);

  const filters = <ProductFilters state={state} facets={facets} categories={topCategories} />;

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />

      <header className="mt-6 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
        {state.q === undefined ? null : (
          <p className="mt-4 text-sm font-medium">{t("searchResultsFor", { query: state.q })}</p>
        )}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <aside>
          <details className="rounded-lg border border-border p-4 lg:hidden" name="filters">
            <summary className="cursor-pointer text-sm font-medium">{t("openFilters")}</summary>
            <div className="mt-5">{filters}</div>
          </details>
          <div className="hidden lg:block">{filters}</div>
        </aside>

        <section aria-label={t("title")}>
          <p className="text-sm text-muted-foreground" data-testid="results-count">
            {t("resultsCount", countArgs(total))}
          </p>

          {products.length === 0 ? (
            <EmptyState
              className="mt-8"
              title={t("noResultsTitle")}
              description={t("noResultsBody")}
              action={{ label: t("clearFilters"), href: "/shop" }}
            />
          ) : (
            <ProductGrid products={products} className="mt-8" priorityCount={4} />
          )}

          <ListingPagination
            state={state}
            page={listing?.page ?? 1}
            pageCount={listing?.pageCount ?? 1}
            basePath="/shop"
          />
        </section>
      </div>
    </div>
  );
}
