/**
 * Cache tags for the storefront (Next.js data cache, previous caching model;
 * Cache Components come in Phase 13). Admin writes refresh exactly the tags
 * they affect, via `updateTag` in the Server Actions.
 */
export const CATALOG_TAGS = {
  /** Every listing: home rows, shop, category pages, search, sitemap. */
  lists: "catalog:lists",
  /** The category tree, names and breadcrumbs. */
  categories: "catalog:categories",
  /** One product page. */
  product: (slug: string) => `catalog:product:${slug}`,
  /** Size charts shown on product pages. */
  sizeCharts: "catalog:size-charts",
  /** Catalogue settings (fits, numerals, ...). */
  settings: "settings",
} as const;

/** Fallback lifetime of cached storefront data, in seconds. */
export const STOREFRONT_REVALIDATE_SECONDS = 3600;
