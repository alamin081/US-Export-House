import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { CatalogTx } from "../catalog.repository";

/**
 * Data access for the product import, export and bulk images (Phase 12). No
 * business rules: the services check permissions and plan the changes.
 */

// ---------------------------------------------------------------------------
// references for resolving a sheet
// ---------------------------------------------------------------------------

export async function findImportReferences() {
  const [categories, brands, sizeCharts, tags, presets] = await Promise.all([
    db.category.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, nameEn: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    db.brand.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, nameEn: true },
      orderBy: { nameEn: "asc" },
    }),
    db.sizeChart.findMany({ select: { id: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    db.tag.findMany({ select: { id: true, slug: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    db.optionPreset.findMany({
      where: { isActive: true },
      select: {
        id: true,
        type: true,
        group: true,
        code: true,
        valueEn: true,
        valueBn: true,
        hex: true,
        sortOrder: true,
      },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  return { categories, brands, sizeCharts, tags, presets };
}

export type ImportReferences = Awaited<ReturnType<typeof findImportReferences>>;

const importGraphInclude = {
  category: { select: { id: true, code: true, nameEn: true } },
  brand: { select: { id: true, nameEn: true } },
  sizeChart: { select: { id: true, nameEn: true } },
  extraCategories: { select: { categoryId: true, category: { select: { code: true } } } },
  tags: { select: { tagId: true, tag: { select: { nameEn: true } } } },
  options: {
    include: { values: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  },
  variants: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      optionValues: { select: { optionValueId: true } },
      _count: { select: { movements: true } },
    },
  },
  images: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ProductInclude;

/** Products (not deleted) by code, with everything the planner compares. */
export async function findProductsByCodes(codes: readonly string[]) {
  if (codes.length === 0) return [];
  return db.product.findMany({
    where: { code: { in: [...codes], mode: "insensitive" }, deletedAt: null },
    include: importGraphInclude,
  });
}

export async function findProductsByIds(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.product.findMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    include: importGraphInclude,
  });
}

export async function findProductForImport(client: CatalogTx | typeof db, productId: string) {
  return client.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: importGraphInclude,
  });
}

export type ImportProductGraph = NonNullable<Awaited<ReturnType<typeof findProductForImport>>>;

/** sku (lower-cased) → owner product's code and id, for live variants. */
export async function findVariantOwnersBySkus(skus: readonly string[]) {
  if (skus.length === 0) return new Map<string, { code: string | null; productId: string }>();
  const rows = await db.productVariant.findMany({
    where: { sku: { in: [...skus], mode: "insensitive" }, deletedAt: null },
    select: { sku: true, productId: true, product: { select: { code: true } } },
  });
  return new Map(
    rows.map((row) => [
      row.sku.toLowerCase(),
      { code: row.product.code, productId: row.productId },
    ]),
  );
}

/** Barcodes already used by variants outside `exceptVariantIds`. */
export async function findTakenBarcodesFor(
  barcodes: readonly string[],
  exceptVariantIds: readonly string[],
) {
  if (barcodes.length === 0) return new Set<string>();
  const rows = await db.productVariant.findMany({
    where: { barcode: { in: [...barcodes] }, id: { notIn: [...exceptVariantIds] } },
    select: { barcode: true },
  });
  return new Set(rows.flatMap((row) => (row.barcode === null ? [] : [row.barcode])));
}

/** Slugs starting with `base`, to pick a free one. */
export async function findSlugsStartingWith(client: CatalogTx | typeof db, base: string) {
  const rows = await client.product.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return new Set(rows.map((row) => row.slug));
}

// ---------------------------------------------------------------------------
// the stored dry run
// ---------------------------------------------------------------------------

export interface ImportRowWrite {
  position: number;
  productCode: string | null;
  productName: string;
  productId: string | null;
  rowNumbers: number[];
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR";
  /** Plain JSON values (the service's plan, diff and issues). */
  payload: unknown;
  diff: unknown;
  errors: unknown;
  warnings: unknown;
  sourceRows: unknown;
  requestedPublish: boolean;
  expectedVersion: number | null;
}

export async function createImportRecord(input: {
  fileName: string;
  fileSha256: string;
  fileKind: string;
  headers: string[];
  rowCount: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  errorCount: number;
  warningCount: number;
  warnings: unknown;
  includeCost: boolean;
  createdById: string;
  rows: ImportRowWrite[];
}) {
  const { rows, warnings, ...data } = input;
  const json = (value: unknown) =>
    value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  return db.productImport.create({
    data: {
      ...data,
      warnings: json(warnings),
      rows: {
        create: rows.map((row) => ({
          ...row,
          payload: row.payload as Prisma.InputJsonValue,
          sourceRows: row.sourceRows as Prisma.InputJsonValue,
          diff: json(row.diff),
          errors: json(row.errors),
          warnings: json(row.warnings),
        })),
      },
    },
    select: { id: true },
  });
}

export async function findImport(importId: string) {
  return db.productImport.findUnique({ where: { id: importId } });
}

export async function findImportRows(importId: string) {
  return db.productImportRow.findMany({ where: { importId }, orderBy: { position: "asc" } });
}

export async function findPendingImportRows(importId: string, take: number) {
  return db.productImportRow.findMany({
    where: { importId, outcome: null, action: { in: ["CREATE", "UPDATE"] } },
    orderBy: { position: "asc" },
    take,
  });
}

export async function findDoneImportWithHash(sha256: string, exceptId: string) {
  return db.productImport.findFirst({
    where: { fileSha256: sha256, status: "DONE", id: { not: exceptId } },
    orderBy: { finishedAt: "desc" },
    select: { id: true, finishedAt: true, createdById: true },
  });
}

export async function listImports(take: number) {
  return db.productImport.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      fileName: true,
      mode: true,
      status: true,
      rowCount: true,
      createCount: true,
      updateCount: true,
      errorCount: true,
      appliedCount: true,
      skippedCount: true,
      createdAt: true,
      finishedAt: true,
      createdById: true,
    },
  });
}

export async function findUserNames(userIds: readonly string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await db.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, name: true, email: true },
  });
  return new Map(rows.map((row) => [row.id, row.name ?? row.email ?? row.id]));
}

/** Moves VALIDATED/APPLYING → `to`, only from the states given. */
export async function updateImportStatus(
  importId: string,
  from: ReadonlyArray<"VALIDATED" | "APPLYING">,
  data: Prisma.ProductImportUpdateManyMutationInput,
) {
  const updated = await db.productImport.updateMany({
    where: { id: importId, status: { in: [...from] } },
    data,
  });
  return updated.count === 1;
}

export async function markImportRow(
  rowId: string,
  outcome: "APPLIED" | "SKIPPED",
  reason: string | null,
  productId: string | null,
) {
  await db.productImportRow.update({
    where: { id: rowId },
    data: { outcome, outcomeReason: reason, ...(productId === null ? {} : { productId }) },
  });
}

export async function countImportOutcomes(importId: string) {
  const rows = await db.productImportRow.groupBy({
    by: ["outcome"],
    where: { importId },
    _count: { _all: true },
  });
  const count = (outcome: string) => rows.find((row) => row.outcome === outcome)?._count._all ?? 0;
  return { applied: count("APPLIED"), skipped: count("SKIPPED") };
}

/** Products from imports that asked to publish but are still drafts. */
export async function findPublishRequests() {
  const rows = await db.productImportRow.findMany({
    where: { requestedPublish: true, productId: { not: null }, outcome: "APPLIED" },
    select: { productId: true },
    distinct: ["productId"],
    take: 500,
  });
  return rows.flatMap((row) => (row.productId === null ? [] : [row.productId]));
}

// ---------------------------------------------------------------------------
// applying
// ---------------------------------------------------------------------------

export interface NewTag {
  slug: string;
  nameEn: string;
  searchText: string;
}

export interface NewPreset {
  type: "SIZE" | "COLOUR";
  code: string;
  valueEn: string;
}

/**
 * Tags and presets the file introduced. Existing ones (same slug, or same
 * type/group/code) are reused, so applying twice creates nothing twice.
 */
export async function ensureTagsAndPresets(
  tx: CatalogTx,
  tags: readonly NewTag[],
  presets: readonly NewPreset[],
) {
  const tagIds = new Map<string, string>();
  for (const tag of tags) {
    const row = await tx.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
      select: { id: true },
    });
    tagIds.set(tag.slug, row.id);
  }
  const presetIds = new Map<string, string>();
  for (const preset of presets) {
    const row = await tx.optionPreset.upsert({
      where: { type_group_code: { type: preset.type, group: "Imported", code: preset.code } },
      update: {},
      create: { ...preset, group: "Imported", valueBn: null, hex: null, sortOrder: 900 },
      select: { id: true },
    });
    presetIds.set(`${preset.type}:${preset.code}`, row.id);
  }
  return { tagIds, presetIds };
}

export async function findPresetsForImport(client: CatalogTx | typeof db, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return client.optionPreset.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      type: true,
      code: true,
      valueEn: true,
      valueBn: true,
      hex: true,
      sortOrder: true,
    },
  });
}

/** Runs `work` in one transaction long enough for a 1,000-row file. */
export async function inImportTransaction<T>(work: (tx: CatalogTx) => Promise<T>): Promise<T> {
  return db.$transaction(work, { timeout: 120_000, maxWait: 15_000 });
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

export interface ExportFilter {
  terms: readonly string[];
  categoryId?: string;
  brandId?: string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

function exportWhere(filter: ExportFilter): Prisma.ProductWhereInput {
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
        { variants: { some: { sku: { contains: term, mode: "insensitive" as const } } } },
      ],
    })),
  };
}

/** One page of products for the export, in a stable order. */
export async function findProductsForExport(
  filter: ExportFilter,
  after: string | null,
  take: number,
) {
  return db.product.findMany({
    where: { ...exportWhere(filter), ...(after === null ? {} : { id: { gt: after } }) },
    orderBy: { id: "asc" },
    take,
    include: {
      category: { select: { code: true } },
      brand: { select: { nameEn: true } },
      sizeChart: { select: { nameEn: true } },
      extraCategories: { select: { category: { select: { code: true } } } },
      tags: { select: { tag: { select: { nameEn: true } } } },
      options: { include: { values: true } },
      variants: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { optionValues: { select: { optionValueId: true } } },
      },
    },
  });
}

export type ExportProduct = Awaited<ReturnType<typeof findProductsForExport>>[number];

// ---------------------------------------------------------------------------
// bulk images
// ---------------------------------------------------------------------------

/** Every product with a code: what the image page matches file names to. */
export async function findProductsForImageMatching() {
  return db.product.findMany({
    where: { deletedAt: null, code: { not: null } },
    select: {
      id: true,
      code: true,
      nameEn: true,
      status: true,
      _count: { select: { images: true } },
      options: {
        where: { type: "COLOUR" },
        select: { values: { select: { id: true, code: true, valueEn: true } } },
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function findProductImagesState(productId: string) {
  return db.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      nameEn: true,
      nameBn: true,
      images: { select: { id: true, storageProvider: true, storageKey: true } },
      options: { where: { type: "COLOUR" }, select: { values: { select: { id: true } } } },
      variants: {
        where: { deletedAt: null },
        select: { isActive: true, pricePoisha: true },
      },
    },
  });
}

export async function writeBulkImages(input: {
  productId: string;
  replace: boolean;
  images: ReadonlyArray<{
    url: string;
    storageProvider: string;
    storageKey: string;
    width: number | null;
    height: number | null;
    bytes: number;
    format: string;
    optionValueId: string | null;
    altEn: string;
  }>;
}) {
  return db.$transaction(async (tx) => {
    const removed = input.replace
      ? await tx.productImage.findMany({
          where: { productId: input.productId },
          select: { storageProvider: true, storageKey: true },
        })
      : [];
    if (input.replace) await tx.productImage.deleteMany({ where: { productId: input.productId } });
    const last = await tx.productImage.aggregate({
      where: { productId: input.productId },
      _max: { sortOrder: true },
    });
    let sortOrder = (last._max.sortOrder ?? -1) + 1;
    for (const image of input.images) {
      await tx.productImage.create({
        data: { productId: input.productId, ...image, sortOrder },
      });
      sortOrder += 1;
    }
    await tx.product.update({
      where: { id: input.productId },
      data: { version: { increment: 1 } },
    });
    const count = await tx.productImage.count({ where: { productId: input.productId } });
    return { removed, count };
  });
}
