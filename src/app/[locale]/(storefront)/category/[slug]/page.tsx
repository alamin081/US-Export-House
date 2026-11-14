import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaImage } from "@/components/shared/media-image";
import { ProductGrid } from "@/components/shared/product-grid";
import { localize } from "@/lib/content";
import { countArgs } from "@/lib/number";
import { cachedActiveCategories, cachedListing } from "@/modules/catalog/storefront-catalog.cached";
import { filterStateFrom, ListingPagination, ProductFilters } from "../../shop/product-filters";
import { breadcrumbJsonLd, JsonLd, localePath } from "../../seo";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type RouteParams = Promise<{ locale: string; slug: string }>;

/** Pre-render every active category in both locales; new ones render on demand. */
export async function generateStaticParams() {
  const categories = await cachedActiveCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { locale, slug } = await params;
  const resolved = locale === "bn" ? "bn" : "en";
  const category = (await cachedActiveCategories()).find((candidate) => candidate.slug === slug);
  if (category === undefined) {
    const t = await getTranslations({ locale, namespace: "Category" });
    return { title: t("notFoundTitle") };
  }
  const path = `/category/${category.slug}`;
  const title = localize(category.seoTitle ?? category.name, resolved);
  const description =
    category.seoDescription === null
      ? category.description === null
        ? undefined
        : localize(category.description, resolved)
      : localize(category.seoDescription, resolved);
  return {
    title,
    ...(description === undefined ? {} : { description }),
    alternates: {
      canonical: localePath(resolved, path),
      languages: { "bn-BD": path, "en-BD": `/en${path}`, "x-default": path },
    },
    openGraph: {
      title,
      ...(description === undefined ? {} : { description }),
      url: localePath(resolved, path),
      ...(category.imageUrl === null ? {} : { images: [{ url: category.imageUrl }] }),
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const resolvedLocale = locale === "bn" ? "bn" : "en";
  const state = filterStateFrom(query);

  const listing = await cachedListing({
    categorySlug: slug,
    sizes: [...state.sizes],
    colours: [...state.colours],
    brands: [...state.brands],
    ...(state.min === undefined ? {} : { minTaka: state.min }),
    ...(state.max === undefined ? {} : { maxTaka: state.max }),
    sort: state.sort,
    page: state.page,
  });
  // Unknown or inactive category.
  if (listing === null || listing.category === null) notFound();

  const t = await getTranslations({ locale, namespace: "Shop" });
  const category = listing.category;
  const name = localize(category.name, resolvedLocale);
  const filters = (
    <ProductFilters state={state} facets={listing.facets} lockedCategory={category.slug} />
  );

  return (
    <div className="site-container py-10 lg:py-14">
      <JsonLd
        data={breadcrumbJsonLd(resolvedLocale, [
          { name: t("title"), path: "/shop" },
          ...listing.breadcrumbs.map((crumb) => ({
            name: localize(crumb.name, resolvedLocale),
            path: `/category/${crumb.slug}`,
          })),
        ])}
      />
      <Breadcrumbs
        items={[
          { label: t("title"), href: "/shop" },
          ...listing.breadcrumbs.map((crumb) =>
            crumb.id === category.id
              ? { label: localize(crumb.name, resolvedLocale) }
              : { label: localize(crumb.name, resolvedLocale), href: `/category/${crumb.slug}` },
          ),
        ]}
      />

      <header className="mt-6 grid gap-8 border-b border-border pb-10 lg:grid-cols-[1fr_20rem] lg:items-center">
        <div>
          {category.tagline === null ? null : (
            <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              {localize(category.tagline, resolvedLocale)}
            </p>
          )}
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
          {category.description === null ? null : (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {localize(category.description, resolvedLocale)}
            </p>
          )}
        </div>
        {category.imageUrl === null ? null : (
          <MediaImage
            src={category.imageUrl}
            alt={name}
            ratio="wide"
            className="rounded-lg"
            sizes="(max-width: 1024px) 100vw, 20rem"
            priority
          />
        )}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <aside>
          <details className="rounded-lg border border-border p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">{t("openFilters")}</summary>
            <div className="mt-5">{filters}</div>
          </details>
          <div className="hidden lg:block">{filters}</div>
        </aside>

        <section aria-label={name}>
          <p className="text-sm text-muted-foreground" data-testid="results-count">
            {t("resultsCount", countArgs(listing.total))}
          </p>

          {listing.products.length === 0 ? (
            <EmptyState
              className="mt-8"
              title={t("noResultsTitle")}
              description={t("noResultsBody")}
              action={{ label: t("clearFilters"), href: `/category/${category.slug}` }}
            />
          ) : (
            <ProductGrid products={listing.products} className="mt-8" priorityCount={4} />
          )}

          <ListingPagination
            state={state}
            page={listing.page}
            pageCount={listing.pageCount}
            basePath={`/category/${category.slug}`}
          />
        </section>
      </div>
    </div>
  );
}
