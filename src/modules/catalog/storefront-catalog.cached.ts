import "server-only";

import { unstable_cache } from "next/cache";

import { getCatalogSettings } from "@/modules/settings/settings.service";
import { CATALOG_TAGS, STOREFRONT_REVALIDATE_SECONDS } from "./cache-tags";
import {
  getActiveCategories,
  getHomeProducts,
  getListing,
  getProductPage,
  getPublishedSlugs,
  getSitemapEntries,
  type ListingQuery,
} from "./storefront-catalog.service";

/**
 * Cached storefront reads. Pages call these, never the service directly, so
 * the database is hit once per tag change rather than once per visitor.
 */

const revalidate = STOREFRONT_REVALIDATE_SECONDS;

export const cachedActiveCategories = unstable_cache(getActiveCategories, ["sf-categories"], {
  tags: [CATALOG_TAGS.categories],
  revalidate,
});

export const cachedHomeProducts = unstable_cache(getHomeProducts, ["sf-home"], {
  tags: [CATALOG_TAGS.lists, CATALOG_TAGS.categories],
  revalidate,
});

export const cachedListing = unstable_cache(
  (query: ListingQuery) => getListing(query),
  ["sf-listing"],
  { tags: [CATALOG_TAGS.lists, CATALOG_TAGS.categories], revalidate },
);

export function cachedProductPage(slug: string) {
  return unstable_cache(() => getProductPage(slug), ["sf-product", slug], {
    tags: [
      CATALOG_TAGS.product(slug),
      CATALOG_TAGS.categories,
      CATALOG_TAGS.sizeCharts,
      CATALOG_TAGS.settings,
    ],
    revalidate,
  })();
}

export const cachedPublishedSlugs = unstable_cache(getPublishedSlugs, ["sf-slugs"], {
  tags: [CATALOG_TAGS.lists],
  revalidate,
});

export const cachedSitemapEntries = unstable_cache(getSitemapEntries, ["sf-sitemap"], {
  tags: [CATALOG_TAGS.lists, CATALOG_TAGS.categories],
  revalidate,
});

export const cachedCatalogSettings = unstable_cache(getCatalogSettings, ["catalog-settings"], {
  tags: [CATALOG_TAGS.settings],
  revalidate,
});
