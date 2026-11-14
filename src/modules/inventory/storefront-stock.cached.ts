import "server-only";

import { unstable_cache } from "next/cache";

import { getOutOfStockProductIds, getProductStockStatus } from "./inventory.service";
import { STOCK_REVALIDATE_SECONDS, STOCK_TAG } from "./stock-cache";

/**
 * Cached storefront availability, kept apart from the product page cache:
 * pages stay cached for an hour while these refresh every 30-60 seconds, or
 * at once when an admin stock action updates the `stock:online` tag.
 * Only states (in / few / out) are cached, never quantities.
 */

export function cachedProductStockStatus(slug: string) {
  return unstable_cache(() => getProductStockStatus(slug), ["sf-stock", slug], {
    tags: [STOCK_TAG],
    revalidate: STOCK_REVALIDATE_SECONDS,
  })();
}

export const cachedOutOfStockProductIds = unstable_cache(
  getOutOfStockProductIds,
  ["sf-out-of-stock"],
  { tags: [STOCK_TAG], revalidate: 60 },
);
