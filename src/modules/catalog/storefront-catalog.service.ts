import { PAGE_SIZE } from "@/config/constants";
import type { LocalizedText } from "@/lib/content";
import { getOutOfStockProductIds } from "@/modules/inventory/inventory.service";
import { getCatalogSettings } from "@/modules/settings/settings.service";
import { buildTree, flattenTree, type TreeItem } from "./category-tree";
import { escapeLike, searchTerms } from "./search-text";
import {
  findActiveCategories,
  findBestSellingProductIds,
  findCardsByIds,
  findFacets,
  findListingIds,
  findPublishedProduct,
  findPublishedSlugs,
  type CardRow,
  type PublishedProductRow,
} from "./storefront.repository";

/**
 * The storefront's read model. Everything returned is plain JSON (strings,
 * numbers, arrays), so the cached wrappers in storefront-catalog.cached.ts can
 * store it. Bilingual text is returned as { en, bn? } and resolved with
 * `localize()` in the page, which falls back to English when Bengali is empty.
 */

function text(en: string, bn: string | null | undefined): LocalizedText {
  return bn === null || bn === undefined || bn.trim() === "" ? { en } : { en, bn };
}

function optionalText(en: string | null, bn: string | null): LocalizedText | null {
  if (en === null || en.trim() === "") return null;
  return text(en, bn);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Pairs English and Bengali paragraphs; missing Bengali entries fall back. */
function textList(en: unknown, bn: unknown): LocalizedText[] {
  const english = stringList(en);
  const bengali = stringList(bn);
  return english.map((item, index) => text(item, bengali[index]));
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

export interface ProductCardData {
  id: string;
  slug: string;
  name: LocalizedText;
  image: { url: string; alt: LocalizedText } | null;
  pricePoisha: number;
  /** Compare-at price of the cheapest variant, when it is on sale. */
  comparePricePoisha: number | null;
  /** True when variants have different prices ("from ৳…"). */
  priceVaries: boolean;
  isNew: boolean;
  isBestseller: boolean;
  /** Every variant is out of stock online. Merged in at render time from the
   * short-lived stock cache (see withStockFlags), never stored with the card. */
  outOfStock?: boolean;
}

/** Marks cards whose product is sold out online. */
export function withStockFlags<T extends ProductCardData>(
  cards: readonly T[],
  outOfStockIds: readonly string[],
): T[] {
  const out = new Set(outOfStockIds);
  return cards.map((card) => ({ ...card, outOfStock: out.has(card.id) }));
}

function toCard(row: CardRow): ProductCardData | null {
  const cheapest = [...row.variants].sort((a, b) => a.pricePoisha - b.pricePoisha)[0];
  if (cheapest === undefined) return null;
  const image = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    name: text(row.nameEn, row.nameBn),
    image:
      image === undefined
        ? null
        : { url: image.url, alt: text(image.altEn ?? row.nameEn, image.altBn) },
    pricePoisha: cheapest.pricePoisha,
    comparePricePoisha:
      cheapest.comparePricePoisha !== null && cheapest.comparePricePoisha > cheapest.pricePoisha
        ? cheapest.comparePricePoisha
        : null,
    priceVaries: row.variants.some((variant) => variant.pricePoisha !== cheapest.pricePoisha),
    isNew: row.isNew,
    isBestseller: row.isBestseller,
  };
}

async function cardsFor(ids: readonly string[]) {
  return (await findCardsByIds(ids)).flatMap((row) => {
    const card = toCard(row);
    return card === null ? [] : [card];
  });
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export interface StorefrontCategory {
  id: string;
  parentId: string | null;
  slug: string;
  name: LocalizedText;
  tagline: LocalizedText | null;
  description: LocalizedText | null;
  imageUrl: string | null;
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
  updatedAt: string;
}

export async function getActiveCategories(): Promise<StorefrontCategory[]> {
  const rows = await findActiveCategories();
  const ids = new Set(rows.map((row) => row.id));
  // A category is only shown when its whole chain of parents is active too.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reachable = (id: string | null, depth = 0): boolean => {
    if (id === null) return true;
    const row = byId.get(id);
    return row !== undefined && depth < 10 && reachable(row.parentId, depth + 1);
  };
  return rows
    .filter((row) => (row.parentId === null || ids.has(row.parentId)) && reachable(row.id))
    .map((row) => ({
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: text(row.nameEn, row.nameBn),
      tagline: optionalText(row.taglineEn, row.taglineBn),
      description: optionalText(row.descriptionEn, row.descriptionBn),
      imageUrl: row.imageUrl,
      seoTitle: optionalText(row.seoTitleEn, row.seoTitleBn),
      seoDescription: optionalText(row.seoDescriptionEn, row.seoDescriptionBn),
      updatedAt: row.updatedAt.toISOString(),
    }));
}

/** The category and all its active descendants. */
function descendantIds(categories: readonly StorefrontCategory[], rootId: string): string[] {
  const tree = buildTree(
    categories.map((category) => ({ ...category, nameEn: category.name.en, sortOrder: 0 })),
  );
  const find = (items: Array<TreeItem<{ id: string }>>): TreeItem<{ id: string }> | undefined => {
    for (const item of items) {
      if (item.node.id === rootId) return item;
      const found = find(item.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const root = find(tree);
  return root === undefined ? [] : flattenTree([root]).map((entry) => entry.node.id);
}

/** Breadcrumb chain, root first. */
function ancestorChain(
  categories: readonly StorefrontCategory[],
  categoryId: string,
): StorefrontCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const chain: StorefrontCategory[] = [];
  let current = byId.get(categoryId);
  while (current !== undefined && chain.length < 10) {
    chain.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return chain;
}

// ---------------------------------------------------------------------------
// listings
// ---------------------------------------------------------------------------

export const STOREFRONT_SORTS = ["featured", "newest", "price-asc", "price-desc"] as const;
export type StorefrontSort = (typeof STOREFRONT_SORTS)[number];

export interface ListingQuery {
  categorySlug?: string;
  q?: string;
  sizes?: string[];
  colours?: string[];
  brands?: string[];
  /** A tag slug ("collection" links from the home page and menu). */
  tag?: string;
  minTaka?: number;
  maxTaka?: number;
  /** Only products with at least one variant available online. */
  inStock?: boolean;
  sort?: StorefrontSort;
  page?: number;
}

export interface ListingFacets {
  sizes: Array<{ value: string; label: LocalizedText }>;
  colours: Array<{ value: string; label: LocalizedText; hex: string | null }>;
  brands: Array<{ value: string; label: LocalizedText }>;
}

export interface ListingResult {
  category: StorefrontCategory | null;
  breadcrumbs: StorefrontCategory[];
  products: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
  facets: ListingFacets;
}

/** null when the category slug is unknown or inactive (the page shows 404). */
export async function getListing(query: ListingQuery): Promise<ListingResult | null> {
  const categories = await getActiveCategories();
  let category: StorefrontCategory | null = null;
  let categoryIds: string[] | undefined;
  if (query.categorySlug !== undefined) {
    category = categories.find((candidate) => candidate.slug === query.categorySlug) ?? null;
    if (category === null) return null;
    categoryIds = descendantIds(categories, category.id);
  }

  const take = PAGE_SIZE.storefront;
  const page = Math.max(1, Math.min(query.page ?? 1, 500));
  const terms = searchTerms(query.q ?? "").map(escapeLike);
  const { ids, total } = await findListingIds({
    ...(categoryIds === undefined ? {} : { categoryIds }),
    ...(query.brands === undefined ? {} : { brandSlugs: query.brands }),
    ...(query.tag === undefined ? {} : { tagSlugs: [query.tag] }),
    ...(query.sizes === undefined ? {} : { sizes: query.sizes }),
    ...(query.colours === undefined ? {} : { colours: query.colours }),
    ...(query.minTaka === undefined ? {} : { minPricePoisha: Math.round(query.minTaka * 100) }),
    ...(query.maxTaka === undefined ? {} : { maxPricePoisha: Math.round(query.maxTaka * 100) }),
    ...(query.inStock === true ? { inStockOnly: true } : {}),
    terms,
    sort: query.sort ?? "featured",
    limit: take,
    offset: (page - 1) * take,
  });

  const facetRows = await findFacets(categoryIds);
  return {
    category,
    breadcrumbs: category === null ? [] : ancestorChain(categories, category.id),
    products: await cardsFor(ids),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / take)),
    facets: {
      sizes: facetRows.options
        .filter((row) => row.type === "SIZE")
        .map((row) => ({ value: row.valueEn, label: text(row.valueEn, row.valueBn) })),
      colours: facetRows.options
        .filter((row) => row.type === "COLOUR")
        .map((row) => ({
          value: row.valueEn,
          label: text(row.valueEn, row.valueBn),
          hex: row.hex,
        })),
      brands: facetRows.brands.map((row) => ({
        value: row.slug,
        label: text(row.nameEn, row.nameBn),
      })),
    },
  };
}

/**
 * Home rows. Their "out of stock" labels are taken when this (hourly,
 * catalogue-tagged) cache entry is built: stock changes never rebuild the
 * home page, so a label may lag by up to an hour.
 */
export async function getHomeProducts() {
  const [newest, featured, outOfStock] = await Promise.all([
    findListingIds({ sort: "newest", limit: 4, offset: 0 }),
    findListingIds({ flag: "featured", sort: "featured", limit: 4, offset: 0 }),
    getOutOfStockProductIds(),
  ]);
  const categories = await getActiveCategories();
  return {
    newArrivals: withStockFlags(await cardsFor(newest.ids), outOfStock),
    featured: withStockFlags(await cardsFor(featured.ids), outOfStock),
    categories: categories.filter((category) => category.parentId === null),
  };
}

// ---------------------------------------------------------------------------
// home page product rows (Phase 12 content)
// ---------------------------------------------------------------------------

export interface ProductRowQuery {
  rule: "new" | "featured" | "bestselling" | "tag" | "category" | "manual";
  tagSlug: string | null;
  categoryId: string | null;
  productIds: readonly string[];
  limit: number;
  /** Look-back of "best selling" (report setting, default 30 days). */
  bestSellerDays: number;
}

/** Published products for one home row, in the row's order; never throws for an empty rule. */
export async function getProductRow(query: ProductRowQuery): Promise<ProductCardData[]> {
  const limit = Math.max(1, Math.min(24, query.limit));
  const base = { limit, offset: 0 } as const;
  let ids: string[] = [];
  if (query.rule === "new") {
    ids = (await findListingIds({ ...base, sort: "newest" })).ids;
  } else if (query.rule === "featured") {
    ids = (await findListingIds({ ...base, flag: "featured", sort: "featured" })).ids;
  } else if (query.rule === "tag" && query.tagSlug !== null) {
    ids = (await findListingIds({ ...base, tagSlugs: [query.tagSlug], sort: "featured" })).ids;
  } else if (query.rule === "category" && query.categoryId !== null) {
    const categories = await getActiveCategories();
    if (!categories.some((category) => category.id === query.categoryId)) return [];
    const categoryIds = descendantIds(categories, query.categoryId);
    ids = (await findListingIds({ ...base, categoryIds, sort: "featured" })).ids;
  } else if (query.rule === "manual" || query.rule === "bestselling") {
    const wanted =
      query.rule === "manual"
        ? [...query.productIds]
        : await findBestSellingProductIds(
            new Date(Date.now() - query.bestSellerDays * 24 * 60 * 60 * 1000),
            limit * 3,
          );
    // Keep only live products, in the wanted order.
    const live = new Set(
      (
        await findListingIds({
          limit: wanted.length || 1,
          offset: 0,
          productIds: wanted,
          sort: "newest",
        })
      ).ids,
    );
    ids = wanted.filter((id) => live.has(id)).slice(0, limit);
  }
  if (ids.length === 0) return [];
  const [cards, outOfStock] = await Promise.all([cardsFor(ids), getOutOfStockProductIds()]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  return withStockFlags(
    ids.flatMap((id) => {
      const card = byId.get(id);
      return card === undefined ? [] : [card];
    }),
    outOfStock,
  );
}

// ---------------------------------------------------------------------------
// product page
// ---------------------------------------------------------------------------

export interface ProductOptionValue {
  id: string;
  label: LocalizedText;
  hex: string | null;
}

export interface SizeChartData {
  name: LocalizedText;
  note: LocalizedText | null;
  unit: "INCH" | "CM";
  columns: LocalizedText[];
  rows: Array<{ size: string; values: string[] }>;
}

export interface ProductPageData {
  id: string;
  slug: string;
  name: LocalizedText;
  summary: LocalizedText | null;
  description: LocalizedText[];
  fabric: LocalizedText | null;
  care: LocalizedText[];
  fit: LocalizedText | null;
  brand: LocalizedText | null;
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
  isNew: boolean;
  isBestseller: boolean;
  updatedAt: string;
  breadcrumbs: StorefrontCategory[];
  images: Array<{ url: string; alt: LocalizedText; colourId: string | null }>;
  sizes: ProductOptionValue[];
  colours: ProductOptionValue[];
  variants: Array<{
    id: string;
    sku: string;
    sizeId: string | null;
    colourId: string | null;
    pricePoisha: number;
    comparePricePoisha: number | null;
  }>;
  minPricePoisha: number;
  maxPricePoisha: number;
  sizeChart: SizeChartData | null;
  related: ProductCardData[];
  /** For structured data only, as of when this hourly cache entry was built.
   * Live per-variant stock comes from the availability endpoint. */
  inStock: boolean;
}

function sizeChartFrom(chart: PublishedProductRow["sizeChart"]): SizeChartData | null {
  if (chart === null) return null;
  const columns = Array.isArray(chart.columns)
    ? (chart.columns as Array<{ en?: unknown; bn?: unknown }>)
    : [];
  const rows = Array.isArray(chart.rows)
    ? (chart.rows as Array<{ size?: unknown; values?: unknown }>)
    : [];
  return {
    name: text(chart.nameEn, chart.nameBn),
    note: optionalText(chart.noteEn, chart.noteBn),
    unit: chart.unit,
    columns: columns
      .filter((column) => typeof column.en === "string")
      .map((column) => text(String(column.en), typeof column.bn === "string" ? column.bn : null))
      // The Phase 4 seed stored "Size" as the first column; it is the row header here.
      .filter((column, index) => !(index === 0 && column.en.toLowerCase() === "size")),
    rows: rows
      .filter((row) => typeof row.size === "string")
      .map((row) => ({ size: String(row.size), values: stringList(row.values) })),
  };
}

/** null when the product is missing, draft, archived or deleted (the page 404s). */
export async function getProductPage(slug: string): Promise<ProductPageData | null> {
  const row = await findPublishedProduct(slug);
  if (row === null || row.variants.length === 0) return null;

  const [categories, settings] = await Promise.all([getActiveCategories(), getCatalogSettings()]);
  const sizes = new Map<string, ProductOptionValue & { sort: number }>();
  const colours = new Map<string, ProductOptionValue & { sort: number }>();
  const variants = row.variants.map((variant) => {
    let sizeId: string | null = null;
    let colourId: string | null = null;
    for (const { optionValue } of variant.optionValues) {
      const entry = {
        id: optionValue.id,
        label: text(optionValue.valueEn, optionValue.valueBn),
        hex: optionValue.hex,
        sort: optionValue.sortOrder,
      };
      if (optionValue.option.type === "SIZE") {
        sizes.set(optionValue.id, entry);
        sizeId = optionValue.id;
      } else {
        colours.set(optionValue.id, entry);
        colourId = optionValue.id;
      }
    }
    return {
      id: variant.id,
      sku: variant.sku,
      sizeId,
      colourId,
      pricePoisha: variant.pricePoisha,
      comparePricePoisha:
        variant.comparePricePoisha !== null && variant.comparePricePoisha > variant.pricePoisha
          ? variant.comparePricePoisha
          : null,
    };
  });
  const prices = variants.map((variant) => variant.pricePoisha);
  const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort;
  const strip = ({ sort: _sort, ...value }: ProductOptionValue & { sort: number }) => value;
  const fit = settings.fits.find((candidate) => candidate.key === row.fit);

  const [related, outOfStock] = await Promise.all([
    findListingIds({
      categoryIds: [row.categoryId],
      excludeProductId: row.id,
      sort: "featured",
      limit: 4,
      offset: 0,
    }),
    getOutOfStockProductIds(),
  ]);

  return {
    id: row.id,
    slug: row.slug,
    name: text(row.nameEn, row.nameBn),
    summary: optionalText(row.summaryEn, row.summaryBn),
    description: textList(row.descriptionEn, row.descriptionBn),
    fabric: optionalText(row.fabricEn, row.fabricBn),
    care: textList(row.careEn, row.careBn),
    fit: fit === undefined ? null : text(fit.en, fit.bn ?? null),
    brand:
      row.brand === null || row.brand.deletedAt !== null || !row.brand.isActive
        ? null
        : text(row.brand.nameEn, row.brand.nameBn),
    seoTitle: optionalText(row.seoTitleEn, row.seoTitleBn),
    seoDescription: optionalText(row.seoDescriptionEn, row.seoDescriptionBn),
    isNew: row.isNew,
    isBestseller: row.isBestseller,
    updatedAt: row.updatedAt.toISOString(),
    breadcrumbs: ancestorChain(categories, row.categoryId),
    images: row.images.map((image) => ({
      url: image.url,
      alt: text(image.altEn ?? row.nameEn, image.altBn ?? row.nameBn),
      colourId: image.optionValueId,
    })),
    sizes: [...sizes.values()].sort(bySort).map(strip),
    colours: [...colours.values()].sort(bySort).map(strip),
    variants,
    minPricePoisha: Math.min(...prices),
    maxPricePoisha: Math.max(...prices),
    sizeChart: sizeChartFrom(row.sizeChart ?? row.category.sizeChart),
    related: withStockFlags(await cardsFor(related.ids), outOfStock),
    inStock: !outOfStock.includes(row.id),
  };
}

export async function getSitemapEntries() {
  const [products, categories] = await Promise.all([findPublishedSlugs(), getActiveCategories()]);
  return {
    products: products.map((product) => ({
      slug: product.slug,
      updatedAt: product.updatedAt.toISOString(),
    })),
    categories: categories.map((category) => ({
      slug: category.slug,
      updatedAt: category.updatedAt,
    })),
  };
}

export async function getPublishedSlugs(): Promise<string[]> {
  return (await findPublishedSlugs()).map((product) => product.slug);
}
