import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Read-only queries for the public storefront. Only PUBLISHED, non-deleted
 * products with at least one active, live variant are ever returned.
 *
 * The listing query is raw SQL because it filters and sorts on the cheapest
 * active variant price, which Prisma's query API cannot express.
 */

export interface StorefrontListingFilter {
  categoryIds?: readonly string[];
  brandSlugs?: readonly string[];
  sizes?: readonly string[];
  colours?: readonly string[];
  minPricePoisha?: number;
  maxPricePoisha?: number;
  /** Already normalised and LIKE-escaped search terms. */
  terms?: readonly string[];
  flag?: "new" | "featured" | "bestseller";
  excludeProductId?: string;
  sort: "newest" | "price-asc" | "price-desc" | "featured";
  limit: number;
  offset: number;
}

const LIVE_VARIANT = Prisma.sql`v."deletedAt" IS NULL AND v."isActive" = true`;

function optionFilter(type: "SIZE" | "COLOUR", values: readonly string[]) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "ProductVariant" v
    JOIN "ProductVariantOption" pvo ON pvo."variantId" = v."id"
    JOIN "OptionValue" ov ON ov."id" = pvo."optionValueId"
    JOIN "ProductOption" po ON po."id" = ov."optionId"
    WHERE v."productId" = p."id" AND ${LIVE_VARIANT}
      AND po."type" = ${type}::"OptionType" AND ov."valueEn" IN (${Prisma.join([...values])})
  )`;
}

function termFilter(term: string) {
  const pattern = `%${term}%`;
  return Prisma.sql`(
    p."nameEn" ILIKE ${pattern} OR p."nameBn" ILIKE ${pattern} OR p."code" ILIKE ${pattern}
    OR EXISTS (
      SELECT 1 FROM "ProductTag" pt JOIN "Tag" t ON t."id" = pt."tagId"
      WHERE pt."productId" = p."id" AND t."searchText" ILIKE ${pattern}
    )
    OR EXISTS (
      SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id" AND ${LIVE_VARIANT}
        AND v."sku" ILIKE ${pattern}
    )
  )`;
}

const ORDER_BY: Record<StorefrontListingFilter["sort"], Prisma.Sql> = {
  newest: Prisma.sql`p."publishedAt" DESC NULLS LAST, p."createdAt" DESC`,
  "price-asc": Prisma.sql`min_price ASC, p."nameEn" ASC`,
  "price-desc": Prisma.sql`min_price DESC, p."nameEn" ASC`,
  featured: Prisma.sql`p."isFeatured" DESC, p."isBestseller" DESC, p."publishedAt" DESC NULLS LAST`,
};

/** Ids of matching products in display order, plus the total match count. */
export async function findListingIds(filter: StorefrontListingFilter) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'PUBLISHED'`,
    Prisma.sql`p."deletedAt" IS NULL`,
  ];
  if (filter.categoryIds !== undefined) {
    if (filter.categoryIds.length === 0) return { ids: [], total: 0 };
    const ids = Prisma.join([...filter.categoryIds]);
    conditions.push(Prisma.sql`(p."categoryId" IN (${ids}) OR EXISTS (
      SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id" AND pc."categoryId" IN (${ids})
    ))`);
  }
  if (filter.brandSlugs !== undefined && filter.brandSlugs.length > 0) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Brand" b WHERE b."id" = p."brandId" AND b."deletedAt" IS NULL
        AND b."slug" IN (${Prisma.join([...filter.brandSlugs])})
    )`);
  }
  if (filter.sizes !== undefined && filter.sizes.length > 0)
    conditions.push(optionFilter("SIZE", filter.sizes));
  if (filter.colours !== undefined && filter.colours.length > 0) {
    conditions.push(optionFilter("COLOUR", filter.colours));
  }
  for (const term of filter.terms ?? []) conditions.push(termFilter(term));
  if (filter.flag === "new") conditions.push(Prisma.sql`p."isNew" = true`);
  if (filter.flag === "featured") conditions.push(Prisma.sql`p."isFeatured" = true`);
  if (filter.flag === "bestseller") conditions.push(Prisma.sql`p."isBestseller" = true`);
  if (filter.excludeProductId !== undefined)
    conditions.push(Prisma.sql`p."id" <> ${filter.excludeProductId}`);

  const having: Prisma.Sql[] = [];
  if (filter.minPricePoisha !== undefined)
    having.push(Prisma.sql`MIN(v."pricePoisha") >= ${filter.minPricePoisha}`);
  if (filter.maxPricePoisha !== undefined)
    having.push(Prisma.sql`MIN(v."pricePoisha") <= ${filter.maxPricePoisha}`);

  const rows = await db.$queryRaw<Array<{ id: string; total: bigint }>>`
    SELECT p."id", MIN(v."pricePoisha") AS min_price, COUNT(*) OVER () AS total
    FROM "Product" p
    JOIN "ProductVariant" v ON v."productId" = p."id" AND ${LIVE_VARIANT}
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY p."id"
    ${having.length === 0 ? Prisma.empty : Prisma.sql`HAVING ${Prisma.join(having, " AND ")}`}
    ORDER BY ${ORDER_BY[filter.sort]}
    LIMIT ${filter.limit} OFFSET ${filter.offset}
  `;
  return { ids: rows.map((row) => row.id), total: Number(rows[0]?.total ?? 0) };
}

const cardSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameBn: true,
  isNew: true,
  isBestseller: true,
  images: {
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { url: true, altEn: true, altBn: true },
  },
  variants: {
    where: { deletedAt: null, isActive: true },
    select: { pricePoisha: true, comparePricePoisha: true },
  },
} satisfies Prisma.ProductSelect;

export async function findCardsByIds(ids: readonly string[]) {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: [...ids] }, status: "PUBLISHED", deletedAt: null },
    select: cardSelect,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
}

export type CardRow = Awaited<ReturnType<typeof findCardsByIds>>[number];

/** Active categories, for navigation, listing pages and the sitemap. */
export async function findActiveCategories() {
  return db.category.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: {
      id: true,
      parentId: true,
      slug: true,
      nameEn: true,
      nameBn: true,
      taglineEn: true,
      taglineBn: true,
      descriptionEn: true,
      descriptionBn: true,
      imageUrl: true,
      seoTitleEn: true,
      seoTitleBn: true,
      seoDescriptionEn: true,
      seoDescriptionBn: true,
      sortOrder: true,
      updatedAt: true,
    },
  });
}

/** Sizes, colours and brands that appear on published products in scope. */
export async function findFacets(categoryIds: readonly string[] | undefined) {
  const scope =
    categoryIds === undefined
      ? Prisma.empty
      : categoryIds.length === 0
        ? Prisma.sql`AND false`
        : Prisma.sql`AND (p."categoryId" IN (${Prisma.join([...categoryIds])}) OR EXISTS (
            SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id"
              AND pc."categoryId" IN (${Prisma.join([...categoryIds])})))`;

  const [options, brands] = await Promise.all([
    db.$queryRaw<
      Array<{
        type: "SIZE" | "COLOUR";
        valueEn: string;
        valueBn: string | null;
        hex: string | null;
        sort: number;
      }>
    >`
      SELECT po."type", ov."valueEn", MIN(ov."valueBn") AS "valueBn", MIN(ov."hex") AS "hex",
             MIN(ov."sortOrder") AS sort
      FROM "Product" p
      JOIN "ProductVariant" v ON v."productId" = p."id" AND ${LIVE_VARIANT}
      JOIN "ProductVariantOption" pvo ON pvo."variantId" = v."id"
      JOIN "OptionValue" ov ON ov."id" = pvo."optionValueId"
      JOIN "ProductOption" po ON po."id" = ov."optionId"
      WHERE p."status" = 'PUBLISHED' AND p."deletedAt" IS NULL ${scope}
      GROUP BY po."type", ov."valueEn"
      ORDER BY sort, ov."valueEn"
    `,
    db.$queryRaw<Array<{ slug: string; nameEn: string; nameBn: string | null }>>`
      SELECT DISTINCT b."slug", b."nameEn", b."nameBn"
      FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId"
      WHERE p."status" = 'PUBLISHED' AND p."deletedAt" IS NULL AND b."deletedAt" IS NULL
        AND b."isActive" = true ${scope}
      ORDER BY b."nameEn"
    `,
  ]);
  return { options, brands };
}

/** A published product with everything its page needs. */
export async function findPublishedProduct(slug: string) {
  return db.product.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    select: {
      id: true,
      slug: true,
      code: true,
      nameEn: true,
      nameBn: true,
      summaryEn: true,
      summaryBn: true,
      descriptionEn: true,
      descriptionBn: true,
      fabricEn: true,
      fabricBn: true,
      careEn: true,
      careBn: true,
      fit: true,
      isNew: true,
      isBestseller: true,
      seoTitleEn: true,
      seoTitleBn: true,
      seoDescriptionEn: true,
      seoDescriptionBn: true,
      updatedAt: true,
      categoryId: true,
      brand: { select: { nameEn: true, nameBn: true, isActive: true, deletedAt: true } },
      sizeChart: true,
      category: { select: { sizeChart: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          url: true,
          altEn: true,
          altBn: true,
          optionValueId: true,
          width: true,
          height: true,
        },
      },
      variants: {
        where: { deletedAt: null, isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sku: true,
          pricePoisha: true,
          comparePricePoisha: true,
          optionValues: {
            select: {
              optionValue: {
                select: {
                  id: true,
                  valueEn: true,
                  valueBn: true,
                  hex: true,
                  sortOrder: true,
                  option: { select: { type: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type PublishedProductRow = NonNullable<Awaited<ReturnType<typeof findPublishedProduct>>>;

export async function findPublishedSlugs() {
  return db.product.findMany({
    where: { status: "PUBLISHED", deletedAt: null },
    select: { slug: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
  });
}
