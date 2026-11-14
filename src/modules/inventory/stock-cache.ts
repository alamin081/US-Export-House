/**
 * Cache tag for storefront stock. Stock changes often, so it is cached apart
 * from product pages: an inventory write refreshes only this tag (the small
 * availability reads), never the product pages themselves.
 */
export const STOCK_TAG = "stock:online";

/** Fallback lifetime of cached storefront availability, in seconds. */
export const STOCK_REVALIDATE_SECONDS = 30;
