import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Data access for categories, brands, option presets, tags and size charts.
 * Rules (cycle checks, "in use" checks) live in the services.
 */

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export async function listCategoryRows() {
  return db.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: {
      id: true,
      parentId: true,
      slug: true,
      code: true,
      nameEn: true,
      nameBn: true,
      isActive: true,
      sortOrder: true,
      sizeChartId: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
}

export async function findCategory(categoryId: string) {
  return db.category.findFirst({ where: { id: categoryId, deletedAt: null } });
}

export async function isCategorySlugTaken(slug: string, exceptId?: string) {
  const row = await db.category.findFirst({
    where: { slug, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  return row !== null;
}

export async function isCategoryCodeTaken(code: string, exceptId?: string) {
  const row = await db.category.findFirst({
    where: { code, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  return row !== null;
}

export async function nextCategorySortOrder(parentId: string | null) {
  const last = await db.category.aggregate({
    where: { parentId, deletedAt: null },
    _max: { sortOrder: true },
  });
  return (last._max.sortOrder ?? -1) + 1;
}

export async function createCategory(data: Prisma.CategoryUncheckedCreateInput) {
  return db.category.create({ data, select: { id: true, slug: true } });
}

export async function updateCategory(
  categoryId: string,
  data: Prisma.CategoryUncheckedUpdateInput,
) {
  return db.category.update({ where: { id: categoryId }, data, select: { id: true, slug: true } });
}

/** Writes a new sibling order in one transaction. */
export async function writeCategoryOrder(orderedIds: readonly string[]) {
  await db.$transaction(
    orderedIds.map((id, sortOrder) => db.category.update({ where: { id }, data: { sortOrder } })),
  );
}

/** Live products whose primary or extra category is this one. */
export async function countProductsInCategory(categoryId: string) {
  return db.product.count({
    where: {
      deletedAt: null,
      OR: [{ categoryId }, { extraCategories: { some: { categoryId } } }],
    },
  });
}

export async function countLiveChildCategories(categoryId: string) {
  return db.category.count({ where: { parentId: categoryId, deletedAt: null } });
}

export async function softDeleteCategory(categoryId: string) {
  await db.category.update({
    where: { id: categoryId },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// ---------------------------------------------------------------------------
// brands
// ---------------------------------------------------------------------------

export async function listBrands() {
  return db.brand.findMany({
    where: { deletedAt: null },
    orderBy: { nameEn: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
}

export async function findBrand(brandId: string) {
  return db.brand.findFirst({ where: { id: brandId, deletedAt: null } });
}

export async function isBrandSlugTaken(slug: string, exceptId?: string) {
  const row = await db.brand.findFirst({
    where: { slug, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  return row !== null;
}

export async function upsertBrand(
  brandId: string | undefined,
  data: Prisma.BrandUncheckedCreateInput,
) {
  if (brandId === undefined) return db.brand.create({ data, select: { id: true } });
  return db.brand.update({ where: { id: brandId }, data, select: { id: true } });
}

export async function countProductsForBrand(brandId: string) {
  return db.product.count({ where: { brandId, deletedAt: null } });
}

export async function softDeleteBrand(brandId: string) {
  await db.brand.update({
    where: { id: brandId },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// ---------------------------------------------------------------------------
// option presets
// ---------------------------------------------------------------------------

export async function listOptionPresets() {
  return db.optionPreset.findMany({
    orderBy: [{ type: "asc" }, { group: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { values: true } } },
  });
}

export async function findPresetByCode(type: "SIZE" | "COLOUR", group: string, code: string) {
  return db.optionPreset.findUnique({ where: { type_group_code: { type, group, code } } });
}

export async function upsertOptionPreset(
  presetId: string | undefined,
  data: Prisma.OptionPresetUncheckedCreateInput,
) {
  if (presetId === undefined) return db.optionPreset.create({ data, select: { id: true } });
  return db.optionPreset.update({ where: { id: presetId }, data, select: { id: true } });
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export async function listTags() {
  return db.tag.findMany({
    orderBy: { nameEn: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

export async function isTagSlugTaken(slug: string, exceptId?: string) {
  const row = await db.tag.findFirst({
    where: { slug, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  return row !== null;
}

export async function upsertTag(tagId: string | undefined, data: Prisma.TagUncheckedCreateInput) {
  if (tagId === undefined) return db.tag.create({ data, select: { id: true } });
  return db.tag.update({ where: { id: tagId }, data, select: { id: true } });
}

/** Slugs of products using a tag, so their pages can be refreshed. */
export async function productSlugsForTag(tagId: string) {
  const rows = await db.productTag.findMany({
    where: { tagId },
    select: { product: { select: { slug: true } } },
  });
  return rows.map((row) => row.product.slug);
}

// ---------------------------------------------------------------------------
// size charts
// ---------------------------------------------------------------------------

export async function listSizeCharts() {
  return db.sizeChart.findMany({
    orderBy: { nameEn: "asc" },
    include: { _count: { select: { products: true, categories: true } } },
  });
}

export async function findSizeChart(sizeChartId: string) {
  return db.sizeChart.findUnique({ where: { id: sizeChartId } });
}

export async function upsertSizeChart(
  sizeChartId: string | undefined,
  data: Prisma.SizeChartUncheckedCreateInput,
) {
  if (sizeChartId === undefined) return db.sizeChart.create({ data, select: { id: true } });
  return db.sizeChart.update({ where: { id: sizeChartId }, data, select: { id: true } });
}

export async function countSizeChartUsage(sizeChartId: string) {
  const [products, categories] = await Promise.all([
    db.product.count({ where: { sizeChartId, deletedAt: null } }),
    db.category.count({ where: { sizeChartId, deletedAt: null } }),
  ]);
  return products + categories;
}

export async function deleteSizeChart(sizeChartId: string) {
  await db.sizeChart.delete({ where: { id: sizeChartId } });
}
