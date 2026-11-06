import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductGrid } from "@/components/shared/product-grid";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { localize } from "@/lib/content";
import { countArgs } from "@/lib/number";
import {
  getProducts,
  isCategorySlug,
  isSortOption,
  type MockProduct,
} from "@/modules/catalog/catalog.mock";
import { getPriceBucket, ProductFilters } from "./product-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("shopTitle") };
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Free-text search across the sample catalogue (name, summary and SKU). */
function matchesQuery(product: MockProduct, query: string): boolean {
  const haystack = [product.name.en, product.name.bn ?? "", product.summary.en, product.sku]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "Shop" });

  const categoryParam = first(query.category);
  const sortParam = first(query.sort);
  const priceParam = first(query.price);
  const searchTerm = first(query.q)?.trim();
  const sizes = all(query.size);
  const bucket = getPriceBucket(priceParam);

  let products = getProducts({
    ...(isCategorySlug(categoryParam) ? { category: categoryParam } : {}),
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(bucket?.minPoisha === undefined ? {} : { minPricePoisha: bucket.minPoisha }),
    ...(bucket?.maxPoisha === undefined ? {} : { maxPricePoisha: bucket.maxPoisha }),
    sort: isSortOption(sortParam) ? sortParam : "featured",
  });

  if (searchTerm !== undefined && searchTerm !== "") {
    products = products.filter((product) => matchesQuery(product, searchTerm));
  }

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />

      <header className="mt-6 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
        {searchTerm === undefined || searchTerm === "" ? null : (
          <p className="mt-4 text-sm font-medium">{t("searchResultsFor", { query: searchTerm })}</p>
        )}
      </header>

      <SampleContentNote className="mt-6" />

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        {/* Filters: a collapsible panel on mobile, a sidebar from `lg`. */}
        <aside>
          <details className="rounded-lg border border-border p-4 lg:hidden" name="filters">
            <summary className="cursor-pointer text-sm font-medium">{t("openFilters")}</summary>
            <div className="mt-5">
              <ProductFilters
                state={{
                  ...(categoryParam === undefined ? {} : { category: categoryParam }),
                  sizes,
                  ...(priceParam === undefined ? {} : { price: priceParam }),
                  sort: sortParam ?? "featured",
                  ...(searchTerm === undefined ? {} : { q: searchTerm }),
                }}
              />
            </div>
          </details>

          <div className="hidden lg:block">
            <ProductFilters
              state={{
                ...(categoryParam === undefined ? {} : { category: categoryParam }),
                sizes,
                ...(priceParam === undefined ? {} : { price: priceParam }),
                sort: sortParam ?? "featured",
                ...(searchTerm === undefined ? {} : { q: searchTerm }),
              }}
            />
          </div>
        </aside>

        <section aria-label={t("title")}>
          <p className="text-sm text-muted-foreground">
            {t("resultsCount", countArgs(products.length))}
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
        </section>
      </div>

      {/* Locale-aware fallback note: the catalogue is bilingual, and a product
          with no Bengali copy falls back to English (visible in `bn`). */}
      {locale === "bn" && products.some((product) => product.name.bn === undefined) ? (
        <p className="mt-10 text-xs text-muted-foreground">
          {localize(
            {
              en: "Some products do not have Bengali copy yet and are shown in English.",
              bn: "কিছু পণ্যের বাংলা লেখা এখনো যোগ করা হয়নি, সেগুলো ইংরেজিতে দেখানো হচ্ছে।",
            },
            "bn",
          )}
        </p>
      ) : null}
    </div>
  );
}
