import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { buildProductCode, renderSku } from "./sku";
import { optionKeyOf } from "./variant-matrix";

/**
 * Data access for the admin catalogue. No business rules: the services decide
 * what is allowed and hand over a complete plan; this file only executes it.
 */

/** Thrown inside the save transaction when someone else saved first. */
export class ProductVersionConflict extends Error {
  constructor() {
    super("Product version conflict");
    this.name = "ProductVersionConflict";
  }
}

// ---------------------------------------------------------------------------
// product list (admin)
// ---------------------------------------------------------------------------

export interface AdminProductFilter {
  terms: readonly string[];
  categoryId?: string;
  brandId?: string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  sort: "updated" | "name" | "created" | "status";
  skip: number;
  take: number;
}

function adminProductWhere(filter: AdminProductFilter): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    ...(filter.status === undefined ? {} : { status: filter.status }),
    ...(filter.brandId === undefined ? {} : { brandId: filter.brandId }),
    ...(filter.categoryId === undefined
      ? {}
      : {
          OR: [
            { categoryId: filter.categoryId },
            { extraCategories: { some: { categoryId: filter.categoryId } } },
          ],
        }),
    AND: filter.terms.map((term) => ({
      OR: [
        { nameEn: { contains: term, mode: "insensitive" as const } },
        { nameBn: { contains: term, mode: "insensitive" as const } },
        { code: { contains: term, mode: "insensitive" as const } },
        {
          variants: {
            some: {
              OR: [
                { sku: { contains: term, mode: "insensitive" as const } },
                { barcode: { contains: term, mode: "insensitive" as const } },
              ],
            },
          },
        },
      ],
    })),
  };
}

const ADMIN_SORT: Record<AdminProductFilter["sort"], Prisma.ProductOrderByWithRelationInput[]> = {
  updated: [{ updatedAt: "desc" }],
  name: [{ nameEn: "asc" }],
  created: [{ createdAt: "desc" }],
  status: [{ status: "asc" }, { updatedAt: "desc" }],
};

export async function listAdminProducts(filter: AdminProductFilter) {
  const where = adminProductWhere(filter);
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: ADMIN_SORT[filter.sort],
      skip: filter.skip,
      take: filter.take,
      select: {
        id: true,
        slug: true,
        code: true,
        nameEn: true,
        nameBn: true,
        status: true,
        updatedAt: true,
        category: { select: { nameEn: true } },
        brand: { select: { nameEn: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { url: true, altEn: true },
        },
        variants: {
          where: { deletedAt: null },
          select: { pricePoisha: true, isActive: true },
        },
      },
    }),
    db.product.count({ where }),
  ]);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// product edit graph
// ---------------------------------------------------------------------------

export async function findProductForEdit(productId: string) {
  return db.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: {
      category: { select: { id: true, code: true, nameEn: true } },
      extraCategories: { select: { categoryId: true } },
      tags: { select: { tagId: true } },
      options: {
        include: { values: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      variants: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          optionValues: { select: { optionValueId: true } },
          inventoryLevels: { select: { onHand: true, reserved: true } },
        },
      },
      images: { orderBy: { sortOrder: "asc" } },
      _count: { select: { variants: { where: { deletedAt: { not: null } } } } },
    },
  });
}

export type ProductEditGraph = NonNullable<Awaited<ReturnType<typeof findProductForEdit>>>;

/** Everything the publish check needs, for several products at once. */
export async function findProductsForStatusChange(productIds: readonly string[]) {
  return db.product.findMany({
    where: { id: { in: [...productIds] }, deletedAt: null },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameBn: true,
      status: true,
      publishedAt: true,
      _count: { select: { images: true } },
      variants: {
        where: { deletedAt: null },
        select: { isActive: true, pricePoisha: true },
      },
    },
  });
}

export async function updateProductStatus(
  productId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  publishedAt: Date | null | undefined,
) {
  await db.product.update({
    where: { id: productId },
    data: {
      status,
      version: { increment: 1 },
      ...(publishedAt === undefined ? {} : { publishedAt }),
    },
  });
}

export async function isProductSlugTaken(slug: string, exceptProductId?: string) {
  const found = await db.product.findFirst({
    where: { slug, ...(exceptProductId === undefined ? {} : { id: { not: exceptProductId } }) },
    select: { id: true },
  });
  return found !== null;
}

/** SKUs (or barcodes) from the list that belong to variants other than `exceptIds`. */
export async function findTakenSkus(skus: readonly string[], exceptVariantIds: readonly string[]) {
  if (skus.length === 0) return [];
  const rows = await db.productVariant.findMany({
    where: { sku: { in: [...skus] }, id: { notIn: [...exceptVariantIds] } },
    select: { sku: true },
  });
  return rows.map((row) => row.sku);
}

export async function findTakenBarcodes(
  barcodes: readonly string[],
  exceptVariantIds: readonly string[],
) {
  if (barcodes.length === 0) return [];
  const rows = await db.productVariant.findMany({
    where: { barcode: { in: [...barcodes] }, id: { notIn: [...exceptVariantIds] } },
    select: { barcode: true },
  });
  return rows.map((row) => row.barcode).filter((value): value is string => value !== null);
}

export async function countOrderLinesForProduct(productId: string) {
  return db.orderItem.count({ where: { variant: { productId } } });
}

/** Soft-deletes a draft product and removes its image rows; returns the files. */
export async function softDeleteProduct(productId: string) {
  return db.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({
      where: { productId },
      select: { storageProvider: true, storageKey: true },
    });
    await tx.productImage.deleteMany({ where: { productId } });
    await tx.productVariant.updateMany({
      where: { productId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    await tx.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return images;
  });
}

// ---------------------------------------------------------------------------
// reference data
// ---------------------------------------------------------------------------

export async function findCategoriesByIds(ids: readonly string[]) {
  return db.category.findMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    select: { id: true, code: true, slug: true, isActive: true },
  });
}

export async function findBrandById(brandId: string) {
  return db.brand.findFirst({ where: { id: brandId, deletedAt: null }, select: { id: true } });
}

export async function findSizeChartById(sizeChartId: string) {
  return db.sizeChart.findUnique({ where: { id: sizeChartId }, select: { id: true } });
}

export async function findTagsByIds(ids: readonly string[]) {
  return db.tag.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });
}

export async function findPresetsByIds(ids: readonly string[]) {
  return db.optionPreset.findMany({ where: { id: { in: [...ids] } } });
}

/** Lookup lists for the product form. */
export async function listProductFormReferences() {
  const [categories, brands, sizeCharts, tags, presets] = await Promise.all([
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
      select: {
        id: true,
        parentId: true,
        nameEn: true,
        code: true,
        sortOrder: true,
        isActive: true,
      },
    }),
    db.brand.findMany({
      where: { deletedAt: null },
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, isActive: true },
    }),
    db.sizeChart.findMany({ orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true } }),
    db.tag.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameBn: true },
    }),
    db.optionPreset.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { group: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  return { categories, brands, sizeCharts, tags, presets };
}

// ---------------------------------------------------------------------------
// the product + variants save, in one transaction
// ---------------------------------------------------------------------------

export interface ProductScalars {
  slug: string;
  nameEn: string;
  nameBn: string | null;
  summaryEn: string | null;
  summaryBn: string | null;
  descriptionEn: string[] | null;
  descriptionBn: string[] | null;
  fabricEn: string | null;
  fabricBn: string | null;
  careEn: string[] | null;
  careBn: string[] | null;
  categoryId: string;
  brandId: string | null;
  sizeChartId: string | null;
  fit: string | null;
  isNew: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  seoTitleEn: string | null;
  seoTitleBn: string | null;
  seoDescriptionEn: string | null;
  seoDescriptionBn: string | null;
}

export interface PlannedOptionValue {
  ref: string;
  type: "SIZE" | "COLOUR";
  /** Set for a value the product already has. */
  existingId?: string;
  /** Set for a value copied from the preset library. */
  create?: {
    valueEn: string;
    valueBn: string | null;
    hex: string | null;
    code: string;
    presetId: string;
    sortOrder: number;
  };
}

export interface PlannedVariant {
  id?: string;
  sizeRef: string | null;
  colourRef: string | null;
  /** "" means: render from the SKU pattern with `skuParts`. */
  sku: string;
  skuParts: { size: string | null; colour: string | null };
  barcode: string | null;
  pricePoisha: number;
  comparePricePoisha: number | null;
  weightGrams: number | null;
  isActive: boolean;
  labelEn: string | null;
  labelBn: string | null;
}

export interface PlannedImage {
  id?: string;
  create?: {
    url: string;
    storageProvider: string;
    storageKey: string;
    width: number | null;
    height: number | null;
    bytes: number;
    format: string;
  };
  altEn: string | null;
  altBn: string | null;
  colourRef: string | null;
}

export interface ProductGraphPlan {
  productId?: string;
  expectedVersion?: number;
  /** New products only: how to build the product code. */
  newProductCode?: { prefix: string; categoryCode: string };
  skuPattern: string;
  scalars: ProductScalars;
  extraCategoryIds: string[];
  tagIds: string[];
  optionValues: PlannedOptionValue[];
  variants: PlannedVariant[];
  archiveVariantIds: string[];
  images: PlannedImage[];
  removeImageIds: string[];
}

function jsonOrNull(value: string[] | null) {
  return value === null ? Prisma.DbNull : value;
}

function scalarData(scalars: ProductScalars) {
  return {
    ...scalars,
    descriptionEn: jsonOrNull(scalars.descriptionEn),
    descriptionBn: jsonOrNull(scalars.descriptionBn),
    careEn: jsonOrNull(scalars.careEn),
    careBn: jsonOrNull(scalars.careBn),
  };
}

/**
 * Saves a product with its options, variants and images atomically. Any
 * failure — a version conflict, a duplicate SKU, a duplicate option
 * combination caught by the partial unique index — rolls everything back.
 */
export async function saveProductGraph(plan: ProductGraphPlan) {
  return db.$transaction(async (tx) => {
    // 1. the product row (with the optimistic lock on updates)
    let productId: string;
    let productCode: string | null;
    if (plan.productId === undefined) {
      if (plan.newProductCode === undefined) throw new Error("newProductCode is required");
      const [row] = await tx.$queryRaw<
        Array<{ value: bigint }>
      >`SELECT nextval('product_code_seq') AS value`;
      productCode = buildProductCode(
        plan.newProductCode.prefix,
        plan.newProductCode.categoryCode,
        Number(row?.value ?? 0),
      );
      const created = await tx.product.create({
        data: { ...scalarData(plan.scalars), code: productCode, status: "DRAFT" },
        select: { id: true },
      });
      productId = created.id;
    } else {
      const updated = await tx.product.updateMany({
        where: { id: plan.productId, version: plan.expectedVersion ?? -1, deletedAt: null },
        data: { ...scalarData(plan.scalars), version: { increment: 1 } },
      });
      if (updated.count === 0) throw new ProductVersionConflict();
      productId = plan.productId;
      productCode =
        (await tx.product.findUnique({ where: { id: productId }, select: { code: true } }))?.code ??
        null;
    }

    // 2. extra categories and tags: replace the sets
    await tx.productCategory.deleteMany({ where: { productId } });
    if (plan.extraCategoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: plan.extraCategoryIds.map((categoryId) => ({ productId, categoryId })),
      });
    }
    await tx.productTag.deleteMany({ where: { productId } });
    if (plan.tagIds.length > 0) {
      await tx.productTag.createMany({ data: plan.tagIds.map((tagId) => ({ productId, tagId })) });
    }

    // 3. option values: reuse existing ones, copy new ones from presets
    const valueIdByRef = new Map<string, string>();
    for (const type of ["SIZE", "COLOUR"] as const) {
      const planned = plan.optionValues.filter((value) => value.type === type);
      if (planned.length === 0) continue;
      const option = await tx.productOption.upsert({
        where: { productId_type: { productId, type } },
        update: {},
        create: {
          productId,
          type,
          nameEn: type === "SIZE" ? "Size" : "Colour",
          nameBn: type === "SIZE" ? "সাইজ" : "রঙ",
          sortOrder: type === "SIZE" ? 0 : 1,
        },
        select: { id: true },
      });
      for (const value of planned) {
        if (value.existingId !== undefined) {
          valueIdByRef.set(value.ref, value.existingId);
        } else if (value.create !== undefined) {
          const created = await tx.optionValue.create({
            data: { optionId: option.id, ...value.create },
            select: { id: true },
          });
          valueIdByRef.set(value.ref, created.id);
        }
      }
    }

    const resolve = (ref: string | null) => {
      if (ref === null) return null;
      const valueId = valueIdByRef.get(ref);
      if (valueId === undefined) throw new Error(`Unresolved option ref ${ref}`);
      return valueId;
    };

    // 4. variants: archive removed ones first, so a re-added combination is free
    if (plan.archiveVariantIds.length > 0) {
      await tx.productVariant.updateMany({
        where: { id: { in: plan.archiveVariantIds }, productId },
        data: { deletedAt: new Date(), isActive: false },
      });
    }

    for (const variant of plan.variants) {
      const sku =
        variant.sku !== ""
          ? variant.sku
          : renderSku(plan.skuPattern, {
              productCode: productCode ?? "",
              colour: variant.skuParts.colour,
              size: variant.skuParts.size,
            });
      const common = {
        sku,
        barcode: variant.barcode,
        pricePoisha: variant.pricePoisha,
        comparePricePoisha: variant.comparePricePoisha,
        weightGrams: variant.weightGrams,
        isActive: variant.isActive,
        labelEn: variant.labelEn,
        labelBn: variant.labelBn,
      };

      if (variant.id !== undefined) {
        await tx.productVariant.update({ where: { id: variant.id, productId }, data: common });
        continue;
      }

      const valueIds = [resolve(variant.sizeRef), resolve(variant.colourRef)].filter(
        (value): value is string => value !== null,
      );
      await tx.productVariant.create({
        data: {
          productId,
          ...common,
          optionKey: optionKeyOf(valueIds),
          optionValues: { create: valueIds.map((optionValueId) => ({ optionValueId })) },
        },
      });
    }

    // 5. images: delete removed rows, then rewrite order, alt text and colour
    if (plan.removeImageIds.length > 0) {
      await tx.productImage.deleteMany({ where: { id: { in: plan.removeImageIds }, productId } });
    }
    for (const [sortOrder, image] of plan.images.entries()) {
      const data = {
        altEn: image.altEn,
        altBn: image.altBn,
        sortOrder,
        optionValueId: resolve(image.colourRef),
      };
      if (image.id !== undefined) {
        await tx.productImage.update({ where: { id: image.id, productId }, data });
      } else if (image.create !== undefined) {
        await tx.productImage.create({ data: { productId, ...image.create, ...data } });
      }
    }

    const saved = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { id: true, slug: true, code: true, version: true },
    });
    return saved;
  });
}

/** Copy-only update for Content Editors, with the same optimistic lock. */
export async function saveProductContent(input: {
  productId: string;
  expectedVersion: number;
  data: Omit<
    ProductScalars,
    | "slug"
    | "categoryId"
    | "brandId"
    | "sizeChartId"
    | "fit"
    | "isNew"
    | "isFeatured"
    | "isBestseller"
  >;
  images: ReadonlyArray<{ id: string; altEn: string | null; altBn: string | null }>;
}) {
  return db.$transaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: { id: input.productId, version: input.expectedVersion, deletedAt: null },
      data: {
        ...input.data,
        descriptionEn: jsonOrNull(input.data.descriptionEn),
        descriptionBn: jsonOrNull(input.data.descriptionBn),
        careEn: jsonOrNull(input.data.careEn),
        careBn: jsonOrNull(input.data.careBn),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw new ProductVersionConflict();
    for (const image of input.images) {
      await tx.productImage.updateMany({
        where: { id: image.id, productId: input.productId },
        data: { altEn: image.altEn, altBn: image.altBn },
      });
    }
    return tx.product.findUniqueOrThrow({
      where: { id: input.productId },
      select: { id: true, slug: true, code: true, version: true },
    });
  });
}

/** A Content Editor's draft: copy and a category, no variants or images. */
export async function createDraftProduct(input: {
  scalars: Pick<ProductScalars, "slug" | "categoryId"> &
    Omit<
      ProductScalars,
      | "slug"
      | "categoryId"
      | "brandId"
      | "sizeChartId"
      | "fit"
      | "isNew"
      | "isFeatured"
      | "isBestseller"
    >;
  newProductCode: { prefix: string; categoryCode: string } | null;
}) {
  return db.$transaction(async (tx) => {
    let code: string | null = null;
    if (input.newProductCode !== null) {
      const [row] = await tx.$queryRaw<
        Array<{ value: bigint }>
      >`SELECT nextval('product_code_seq') AS value`;
      code = buildProductCode(
        input.newProductCode.prefix,
        input.newProductCode.categoryCode,
        Number(row?.value ?? 0),
      );
    }
    const scalars = input.scalars;
    return tx.product.create({
      data: {
        ...scalars,
        descriptionEn: jsonOrNull(scalars.descriptionEn),
        descriptionBn: jsonOrNull(scalars.descriptionBn),
        careEn: jsonOrNull(scalars.careEn),
        careBn: jsonOrNull(scalars.careBn),
        code,
        status: "DRAFT",
      },
      select: { id: true, slug: true, code: true, version: true },
    });
  });
}

/** Prisma's unique-violation code, and the columns it names. */
export function uniqueViolationTarget(error: unknown): string[] | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === "string") return [target];
    // The driver adapter reports constraint details differently; keep the message.
    const fields = (
      error.meta as { driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } }
    )?.driverAdapterError?.cause?.constraint?.fields;
    return fields ?? [];
  }
  return null;
}
