import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { levelKey, sortedUniqueKeys, type LevelKey } from "./lock-order";
import type { LevelRow } from "./inventory.repository";

/**
 * Read-only stock queries: the admin matrix, history, low stock, lookups for
 * scanning and CSV import, and the online availability the storefront uses.
 *
 * `locationIds === undefined` means every location (a role with
 * `allLocations`); a list restricts the query to those locations.
 */

const LIVE_VARIANT = Prisma.sql`v."deletedAt" IS NULL AND p."deletedAt" IS NULL`;

const variantSummarySelect = {
  id: true,
  sku: true,
  barcode: true,
  labelEn: true,
  isActive: true,
  deletedAt: true,
  costPoisha: true,
  product: {
    select: { id: true, nameEn: true, nameBn: true, code: true, status: true, deletedAt: true },
  },
} satisfies Prisma.ProductVariantSelect;

export type VariantSummaryRow = Prisma.ProductVariantGetPayload<{
  select: typeof variantSummarySelect;
}>;

export async function findVariantsByIds(ids: readonly string[]): Promise<VariantSummaryRow[]> {
  if (ids.length === 0) return [];
  return db.productVariant.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: variantSummarySelect,
  });
}

/** Case-insensitive SKU lookup; the map key is the lower-cased SKU. */
export async function findVariantsBySkus(
  skus: readonly string[],
): Promise<Map<string, VariantSummaryRow>> {
  const lowered = [...new Set(skus.map((sku) => sku.trim().toLowerCase()))];
  if (lowered.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ProductVariant" WHERE lower("sku") = ANY(${lowered}::text[])
  `;
  const variants = await findVariantsByIds(rows.map((row) => row.id));
  return new Map(variants.map((variant) => [variant.sku.toLowerCase(), variant]));
}

/** A scanned code: an exact barcode first, then the SKU in any letter case. */
export async function findVariantByCode(code: string): Promise<VariantSummaryRow | null> {
  const trimmed = code.trim();
  if (trimmed === "") return null;
  const byBarcode = await db.productVariant.findFirst({
    where: { barcode: trimmed, deletedAt: null },
    select: variantSummarySelect,
  });
  if (byBarcode !== null) return byBarcode;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ProductVariant"
    WHERE lower("sku") = lower(${trimmed}) AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const id = rows[0]?.id;
  return id === undefined ? null : ((await findVariantsByIds([id]))[0] ?? null);
}

/** Up to `limit` live variants matching a name, SKU or barcode fragment. */
export async function searchVariants(terms: readonly string[], limit: number) {
  if (terms.length === 0) return [];
  const conditions = terms.map((term) => {
    const pattern = `%${term}%`;
    return Prisma.sql`(p."nameEn" ILIKE ${pattern} OR p."nameBn" ILIKE ${pattern}
      OR v."sku" ILIKE ${pattern} OR v."barcode" ILIKE ${pattern} OR p."code" ILIKE ${pattern})`;
  });
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT v."id" FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
    WHERE ${LIVE_VARIANT} AND ${Prisma.join(conditions, " AND ")}
    ORDER BY p."nameEn", v."sku"
    LIMIT ${limit}
  `;
  const byId = new Map(
    (await findVariantsByIds(rows.map((row) => row.id))).map((row) => [row.id, row]),
  );
  return rows.flatMap((row) => {
    const variant = byId.get(row.id);
    return variant === undefined ? [] : [variant];
  });
}

export async function findLocationsByCodes(codes: readonly string[]) {
  if (codes.length === 0) return [];
  return db.location.findMany({
    where: { code: { in: [...new Set(codes)] } },
    select: { id: true, code: true, nameEn: true, isActive: true, deletedAt: true },
  });
}

/** Current stock rows for the keys, without locking (previews). */
export async function findLevels(keys: readonly LevelKey[]): Promise<Map<string, LevelRow>> {
  const sorted = sortedUniqueKeys(keys);
  if (sorted.length === 0) return new Map();
  const rows = await db.$queryRaw<LevelRow[]>`
    SELECT il."variantId", il."locationId", il."onHand", il."reserved", il."lowStockThreshold"
    FROM "InventoryLevel" il
    JOIN unnest(${sorted.map((key) => key.variantId)}::text[], ${sorted.map((key) => key.locationId)}::text[]) AS k(v, l)
      ON il."variantId" = k.v AND il."locationId" = k.l
  `;
  return new Map(rows.map((row) => [levelKey(row), row]));
}

export async function findKeysWithMovements(keys: readonly LevelKey[]): Promise<Set<string>> {
  const sorted = sortedUniqueKeys(keys);
  if (sorted.length === 0) return new Set();
  const rows = await db.$queryRaw<LevelKey[]>`
    SELECT DISTINCT m."variantId", m."locationId"
    FROM "InventoryMovement" m
    JOIN unnest(${sorted.map((key) => key.variantId)}::text[], ${sorted.map((key) => key.locationId)}::text[]) AS k(v, l)
      ON m."variantId" = k.v AND m."locationId" = k.l
  `;
  return new Set(rows.map(levelKey));
}

/** Earlier CSV imports of the same file (by SHA-256). */
export async function findReceiptsByFileHash(fileHash: string) {
  return db.stockReceipt.findMany({
    where: { fileHash },
    orderBy: { createdAt: "desc" },
    select: {
      reference: true,
      kind: true,
      fileName: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// the matrix
// ---------------------------------------------------------------------------

export interface MatrixFilter {
  terms: readonly string[];
  categoryIds?: readonly string[];
  /** Locations the matrix shows (already narrowed to the caller's access). */
  locationIds: readonly string[];
  stock?: "low" | "out";
  lowStockDefault: number;
  skip: number;
  take: number;
}

function matrixConditions(filter: MatrixFilter): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [LIVE_VARIANT];
  for (const term of filter.terms) {
    const pattern = `%${term}%`;
    conditions.push(Prisma.sql`(p."nameEn" ILIKE ${pattern} OR p."nameBn" ILIKE ${pattern}
      OR v."sku" ILIKE ${pattern} OR v."barcode" ILIKE ${pattern} OR p."code" ILIKE ${pattern})`);
  }
  if (filter.categoryIds !== undefined) {
    const ids = filter.categoryIds.length === 0 ? [""] : [...filter.categoryIds];
    conditions.push(Prisma.sql`(p."categoryId" = ANY(${ids}::text[]) OR EXISTS (
      SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id" AND pc."categoryId" = ANY(${ids}::text[])
    ))`);
  }
  const locations = filter.locationIds.length === 0 ? [""] : [...filter.locationIds];
  if (filter.stock === "low") {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "InventoryLevel" il WHERE il."variantId" = v."id" AND il."locationId" = ANY(${locations}::text[])
        AND il."onHand" - il."reserved" > 0
        AND il."onHand" - il."reserved" <= COALESCE(il."lowStockThreshold", ${filter.lowStockDefault}::int)
    )`);
  }
  if (filter.stock === "out") {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "InventoryLevel" il WHERE il."variantId" = v."id" AND il."locationId" = ANY(${locations}::text[])
        AND il."onHand" - il."reserved" <= 0
    )`);
  }
  return conditions;
}

export async function findMatrixVariantIds(filter: MatrixFilter) {
  const rows = await db.$queryRaw<Array<{ id: string; total: bigint }>>`
    SELECT v."id", COUNT(*) OVER () AS total
    FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
    WHERE ${Prisma.join(matrixConditions(filter), " AND ")}
    ORDER BY p."nameEn", v."sku"
    LIMIT ${filter.take} OFFSET ${filter.skip}
  `;
  return { ids: rows.map((row) => row.id), total: Number(rows[0]?.total ?? 0) };
}

/** Stock rows for variants at locations. */
export async function findLevelsFor(variantIds: readonly string[], locationIds: readonly string[]) {
  if (variantIds.length === 0 || locationIds.length === 0) return [];
  return db.inventoryLevel.findMany({
    where: { variantId: { in: [...variantIds] }, locationId: { in: [...locationIds] } },
    select: {
      variantId: true,
      locationId: true,
      onHand: true,
      reserved: true,
      lowStockThreshold: true,
    },
  });
}

/** Units in transit per variant towards the given destinations. */
export async function findInTransit(
  variantIds: readonly string[],
  destinationIds: readonly string[],
): Promise<Map<string, number>> {
  if (variantIds.length === 0 || destinationIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<{ variantId: string; quantity: bigint }>>`
    SELECT ti."variantId", SUM(ti."quantitySent")::bigint AS quantity
    FROM "StockTransferItem" ti JOIN "StockTransfer" t ON t."id" = ti."transferId"
    WHERE t."status" = 'DISPATCHED'
      AND ti."variantId" = ANY(${[...variantIds]}::text[])
      AND (t."toLocationId" = ANY(${[...destinationIds]}::text[]) OR t."fromLocationId" = ANY(${[...destinationIds]}::text[]))
    GROUP BY ti."variantId"
  `;
  return new Map(rows.map((row) => [row.variantId, Number(row.quantity)]));
}

// ---------------------------------------------------------------------------
// one variant
// ---------------------------------------------------------------------------

export async function findVariantStockDetail(variantId: string) {
  return db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      ...variantSummarySelect,
      pricePoisha: true,
      product: {
        select: {
          id: true,
          nameEn: true,
          nameBn: true,
          code: true,
          status: true,
          deletedAt: true,
          categoryId: true,
        },
      },
    },
  });
}

export interface MovementFilter {
  variantId?: string;
  locationIds?: readonly string[];
  types?: readonly string[];
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

export async function findMovements(filter: MovementFilter) {
  const where: Prisma.InventoryMovementWhereInput = {
    ...(filter.variantId === undefined ? {} : { variantId: filter.variantId }),
    ...(filter.locationIds === undefined ? {} : { locationId: { in: [...filter.locationIds] } }),
    ...(filter.types === undefined || filter.types.length === 0
      ? {}
      : { type: { in: filter.types as Prisma.EnumMovementTypeFilter["in"] } }),
    ...(filter.from === undefined && filter.to === undefined
      ? {}
      : {
          createdAt: {
            ...(filter.from === undefined ? {} : { gte: filter.from }),
            ...(filter.to === undefined ? {} : { lt: filter.to }),
          },
        }),
  };
  const [rows, total] = await Promise.all([
    db.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: filter.skip,
      take: filter.take,
      select: {
        id: true,
        type: true,
        quantity: true,
        reasonCode: true,
        reason: true,
        onHandAfter: true,
        reservedAfter: true,
        unitCostPoisha: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
        location: { select: { id: true, code: true } },
        variant: { select: { id: true, sku: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    db.inventoryMovement.count({ where }),
  ]);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// low stock
// ---------------------------------------------------------------------------

export async function findLowStock(input: {
  locationIds: readonly string[] | undefined;
  lowStockDefault: number;
  limit: number;
}) {
  const scope =
    input.locationIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND il."locationId" = ANY(${input.locationIds.length === 0 ? [""] : [...input.locationIds]}::text[])`;
  const rows = await db.$queryRaw<
    Array<{
      variantId: string;
      locationId: string;
      sku: string;
      labelEn: string | null;
      productName: string;
      locationCode: string;
      available: number;
      threshold: number;
      total: bigint;
    }>
  >`
    SELECT il."variantId", il."locationId", v."sku", v."labelEn", p."nameEn" AS "productName",
           l."code" AS "locationCode", (il."onHand" - il."reserved") AS available,
           COALESCE(il."lowStockThreshold", ${input.lowStockDefault}::int) AS threshold,
           COUNT(*) OVER () AS total
    FROM "InventoryLevel" il
    JOIN "ProductVariant" v ON v."id" = il."variantId"
    JOIN "Product" p ON p."id" = v."productId"
    JOIN "Location" l ON l."id" = il."locationId"
    WHERE ${LIVE_VARIANT} AND v."isActive" = true AND l."isActive" = true AND l."deletedAt" IS NULL
      AND il."onHand" - il."reserved" <= COALESCE(il."lowStockThreshold", ${input.lowStockDefault}::int)
      ${scope}
    ORDER BY available ASC, p."nameEn", v."sku"
    LIMIT ${input.limit}
  `;
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

// ---------------------------------------------------------------------------
// availability
// ---------------------------------------------------------------------------

const ONLINE_LOCATION = Prisma.sql`l."isOnlineFulfillment" = true AND l."isActive" = true AND l."deletedAt" IS NULL`;

/** Available units per variant across the online-fulfilment locations. */
export async function findOnlineAvailable(variantIds: readonly string[]) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await db.$queryRaw<Array<{ variantId: string; available: bigint }>>`
    SELECT il."variantId", SUM(GREATEST(il."onHand" - il."reserved", 0))::bigint AS available
    FROM "InventoryLevel" il JOIN "Location" l ON l."id" = il."locationId"
    WHERE ${ONLINE_LOCATION} AND il."variantId" = ANY(${[...variantIds]}::text[])
    GROUP BY il."variantId"
  `;
  return new Map(rows.map((row) => [row.variantId, Number(row.available)]));
}

/** Available units at one location per variant. */
export async function findLocationAvailable(locationId: string, variantIds: readonly string[]) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await db.inventoryLevel.findMany({
    where: { locationId, variantId: { in: [...variantIds] } },
    select: { variantId: true, onHand: true, reserved: true },
  });
  return new Map(rows.map((row) => [row.variantId, Math.max(0, row.onHand - row.reserved)]));
}

/** Live variants of a published product with their online availability. */
export async function findProductOnlineAvailability(slug: string) {
  return db.$queryRaw<Array<{ variantId: string; available: bigint }>>`
    SELECT v."id" AS "variantId",
           COALESCE((
             SELECT SUM(GREATEST(il."onHand" - il."reserved", 0))
             FROM "InventoryLevel" il JOIN "Location" l ON l."id" = il."locationId"
             WHERE il."variantId" = v."id" AND ${ONLINE_LOCATION}
           ), 0)::bigint AS available
    FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
    WHERE p."slug" = ${slug} AND p."status" = 'PUBLISHED' AND ${LIVE_VARIANT} AND v."isActive" = true
  `;
}

/**
 * Per published product: the most any one live variant has available online.
 * 0 means every variant is out of stock.
 */
export async function findProductsBestAvailability() {
  const rows = await db.$queryRaw<Array<{ productId: string; best: bigint }>>`
    SELECT v."productId", MAX(COALESCE(a.available, 0))::bigint AS best
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    LEFT JOIN (
      SELECT il."variantId", SUM(GREATEST(il."onHand" - il."reserved", 0)) AS available
      FROM "InventoryLevel" il JOIN "Location" l ON l."id" = il."locationId"
      WHERE ${ONLINE_LOCATION}
      GROUP BY il."variantId"
    ) a ON a."variantId" = v."id"
    WHERE p."status" = 'PUBLISHED' AND ${LIVE_VARIANT} AND v."isActive" = true
    GROUP BY v."productId"
  `;
  return new Map(rows.map((row) => [row.productId, Number(row.best)]));
}

// ---------------------------------------------------------------------------
// categories (filters and count scopes)
// ---------------------------------------------------------------------------

/** The category and every category below it. */
export async function findCategoryWithDescendants(categoryId: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE tree AS (
      SELECT "id" FROM "Category" WHERE "id" = ${categoryId} AND "deletedAt" IS NULL
      UNION ALL
      SELECT c."id" FROM "Category" c JOIN tree t ON c."parentId" = t."id" WHERE c."deletedAt" IS NULL
    )
    SELECT "id" FROM tree
  `;
  return rows.map((row) => row.id);
}

export async function findCategoryOptions() {
  return db.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: { id: true, nameEn: true, parentId: true },
  });
}
