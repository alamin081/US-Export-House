/**
 * Cache tags for storefront content (Phase 12). Publishing refreshes the
 * document's tag with `updateTag`, so the change shows on the next request.
 */
export const CONTENT_TAGS = {
  document: (key: string) => `content:${key}`,
  /** Which pages are live (menus, footer, sitemap). */
  pages: "content:pages",
  /** Branch details on the footer and contact page. */
  branches: "content:branches",
  /** Settings that feed placeholders, the footer and contact details. */
  settings: "settings",
  /** Admin rewordings of storefront UI labels. */
  labels: "ui-labels",
  /** Products sold most in the last days (home "best selling" rows). */
  bestSellers: "reports:best-sellers",
} as const;

/**
 * Fallback lifetime of cached content, in seconds. Scheduled banners and
 * announcements switch on and off within this time of their start or end.
 */
export const CONTENT_REVALIDATE_SECONDS = 300;
