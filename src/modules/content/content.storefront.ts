import "server-only";

import { cookies, draftMode } from "next/headers";
import { unstable_cache } from "next/cache";

import type { Locale } from "@/i18n/routing";
import { getCurrentStaff } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { cachedActiveCategories } from "@/modules/catalog/storefront-catalog.cached";
import { getProductRow, type ProductRowQuery } from "@/modules/catalog/storefront-catalog.service";
import {
  getCheckoutSettings,
  getReportSettings,
  getReturnsSettings,
  getSiteSettings,
  getStoreSettings,
} from "@/modules/settings/settings.service";
import { CONTENT_REVALIDATE_SECONDS, CONTENT_TAGS } from "./cache-tags";
import {
  CONTENT_SCHEMAS,
  pagePath,
  type ContentKind,
  type ContentLink,
  type ContentOf,
  type Localized,
  type PageContent,
} from "./content.schema";
import type { PlaceholderValues } from "./placeholders";
import * as repo from "./content.repository";

/**
 * Storefront reads of content (Phase 12). Published content is cached by tag;
 * staff previewing a draft (Next.js draft mode AND a signed-in staff member
 * with content.write) get the draft, uncached. A cookie alone never shows a
 * draft.
 */

const revalidate = CONTENT_REVALIDATE_SECONDS;

/** True only while a signed-in content editor is previewing drafts. */
export async function isPreviewing(): Promise<boolean> {
  const draft = await draftMode();
  if (!draft.isEnabled) return false;
  const staff = await getCurrentStaff();
  return staff !== null && hasPermission(staff, "content.write");
}

/** Cookie holding the "show the site as at" time chosen in the preview screen. */
export const PREVIEW_AT_COOKIE = "ueh_preview_at";

/**
 * The moment schedules are judged against: now, or — while previewing —
 * the time picked in the preview screen, to see a future campaign.
 */
export async function contentNow(): Promise<Date> {
  if (!(await isPreviewing())) return new Date();
  const value = (await cookies()).get(PREVIEW_AT_COOKIE)?.value ?? "";
  const at = Date.parse(value);
  return Number.isNaN(at) ? new Date() : new Date(at);
}

function cachedPublished(key: string) {
  return unstable_cache(() => repo.findPublishedData(key), ["content", key], {
    tags: [CONTENT_TAGS.document(key)],
    revalidate,
  })();
}

/** The live (or, in preview, the draft) content of a document; null when there is none. */
export async function loadContent<K extends ContentKind>(
  key: string,
  kind: K,
): Promise<ContentOf<K> | null> {
  const preview = await isPreviewing();
  const raw = preview ? await repo.findDraftData(key) : await cachedPublished(key);
  if (raw === null) return null;
  const parsed = CONTENT_SCHEMAS[kind].safeParse(raw);
  if (!parsed.success) {
    console.error(`[content] ${key} does not match its shape; not shown.`);
    return null;
  }
  return parsed.data as ContentOf<K>;
}

export const cachedLivePages = unstable_cache(
  async () =>
    (await repo.findPublishedPages()).map((page) => {
      const data = CONTENT_SCHEMAS.PAGE.safeParse(page.data);
      return {
        key: page.key,
        slug: page.slug,
        path: pagePath(page.slug),
        title: data.success ? data.data.title : { en: page.slug, bn: "" },
        publishedAt: page.publishedAt?.toISOString() ?? null,
      };
    }),
  ["content-live-pages"],
  { tags: [CONTENT_TAGS.pages], revalidate },
);

export const cachedBranches = unstable_cache(
  () => repo.findStorefrontBranches(),
  ["content-branches"],
  { tags: [CONTENT_TAGS.branches], revalidate },
);

const cachedTags = unstable_cache(
  async () => (await repo.findLinkTargets()).tags,
  ["content-tags"],
  { tags: ["catalog:lists"], revalidate },
);

export const cachedContentSettings = unstable_cache(
  async () => {
    const [checkout, returns, store, site] = await Promise.all([
      getCheckoutSettings(),
      getReturnsSettings(),
      getStoreSettings(),
      getSiteSettings(),
    ]);
    const placeholders: PlaceholderValues = {
      freeShippingThresholdPoisha: checkout.freeShippingThresholdPoisha,
      codMaxTotalPoisha: checkout.codMaxTotalPoisha,
      returnWindowDays: returns.windowDays,
      storePhone: store.contactPhone || checkout.storeContactPhone,
    };
    return { placeholders, store, site };
  },
  ["content-settings"],
  { tags: [CONTENT_TAGS.settings], revalidate },
);

const cachedProductLinks = (ids: readonly string[]) =>
  unstable_cache(
    () => repo.findProductsForLinks(ids),
    ["content-product-links", ...[...ids].sort()],
    { tags: ["catalog:lists"], revalidate },
  )();

/** Bilingual text for the locale, Bengali falling back to English. */
export function pick(text: Localized | null | undefined, locale: Locale): string {
  if (text === null || text === undefined) return "";
  return locale === "bn" && text.bn.trim() !== "" ? text.bn : text.en;
}

export interface ResolvedLink {
  href: string;
  /** The target's own name (used when a menu item has no label). */
  name: Localized;
}

/**
 * Turns stored links (ids) into live hrefs. A link to something that is not
 * live resolves to null and is simply not shown.
 */
export async function linkResolver(links: readonly ContentLink[]) {
  const [categories, pages, tags] = await Promise.all([
    cachedActiveCategories(),
    cachedLivePages(),
    cachedTags(),
  ]);
  const productIds = links.flatMap((link) => (link.type === "product" ? [link.id] : []));
  const products = productIds.length === 0 ? [] : await cachedProductLinks(productIds);
  const preview = await isPreviewing();
  return (link: ContentLink | null | undefined): ResolvedLink | null => {
    if (link === null || link === undefined) return null;
    switch (link.type) {
      case "category": {
        const category = categories.find((row) => row.id === link.id);
        return category === undefined
          ? null
          : {
              href: `/category/${category.slug}`,
              name: { en: category.name.en, bn: category.name.bn ?? "" },
            };
      }
      case "page": {
        const page = pages.find((row) => row.key === link.key);
        if (page === undefined) {
          // In preview a link to an unpublished page still shows where it goes.
          if (!preview) return null;
          const slug = link.key.replace(/^page\./, "");
          return { href: pagePath(slug), name: { en: slug, bn: "" } };
        }
        return { href: page.path, name: page.title };
      }
      case "tag": {
        const tag = tags.find((row) => row.slug === link.slug);
        return tag === undefined
          ? null
          : {
              href: `/shop?tag=${encodeURIComponent(tag.slug)}`,
              name: { en: tag.nameEn, bn: tag.nameBn ?? "" },
            };
      }
      case "product": {
        const product = products.find((row) => row.id === link.id);
        return product === undefined || product.status !== "PUBLISHED" || product.deletedAt !== null
          ? null
          : {
              href: `/product/${product.slug}`,
              name: { en: product.nameEn, bn: product.nameBn ?? "" },
            };
      }
      case "url":
        return { href: link.href, name: { en: link.href, bn: "" } };
    }
  };
}

export type LinkResolver = Awaited<ReturnType<typeof linkResolver>>;

/** Products for a home row; best sellers are cached for six hours. */
export async function loadProductRow(query: Omit<ProductRowQuery, "bestSellerDays">) {
  const days = (await getReportSettings()).bestSellerDays;
  if (query.rule === "bestselling") {
    return unstable_cache(
      () => getProductRow({ ...query, bestSellerDays: days }),
      ["content-best-sellers", String(query.limit), String(days)],
      { tags: [CONTENT_TAGS.bestSellers, "catalog:lists"], revalidate: 6 * 60 * 60 },
    )();
  }
  return unstable_cache(
    () => getProductRow({ ...query, bestSellerDays: days }),
    ["content-product-row", JSON.stringify(query)],
    { tags: ["catalog:lists", "catalog:categories"], revalidate },
  )();
}

/** The page document behind a route; null when it is not live (and not previewed). */
export async function loadPage(slug: string): Promise<PageContent | null> {
  return loadContent(`page.${slug}`, "PAGE");
}
