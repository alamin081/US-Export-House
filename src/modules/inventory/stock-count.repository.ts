import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { InventoryUnitOfWork } from "./inventory.repository";

/** Physical stock counts: reads, and writes inside an inventory transaction. */

const userName = { select: { name: true, email: true } } as const;

export async function listStockCounts(filter: {
  scope: readonly string[] | undefined;
  status?: Prisma.StockCountWhereInput["status"];
  skip: number;
  take: number;
}) {
  const where: Prisma.StockCountWhereInput = {
    ...(filter.scope === undefined ? {} : { locationId: { in: [...filter.scope] } }),
    ...(filter.status === undefined ? {} : { status: filter.status }),
  };
  const [rows, total] = await Promise.all([
    db.stockCount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: filter.skip,
      take: filter.take,
      select: {
        id: true,
        reference: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
        location: { select: { code: true, isSample: true } },
        category: { select: { nameEn: true } },
        createdBy: userName,
        _count: { select: { items: true } },
      },
    }),
    db.stockCount.count({ where }),
  ]);
  return { rows, total };
}

export async function findStockCount(id: string) {
  return db.stockCount.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      note: true,
      locationId: true,
      categoryId: true,
      startedAt: true,
      submittedAt: true,
      completedAt: true,
      cancelledAt: true,
      location: { select: { code: true, nameEn: true, isSample: true } },
      category: { select: { nameEn: true } },
      createdBy: userName,
      submittedBy: userName,
      appliedBy: userName,
      items: {
        orderBy: { variant: { sku: "asc" } },
        select: {
          id: true,
          variantId: true,
          systemQty: true,
          snapshotAt: true,
          countedQty: true,
          countedAt: true,
          movementsSinceSnapshot: true,
          differenceQty: true,
          movementId: true,
          variant: {
            select: {
              sku: true,
              barcode: true,
              labelEn: true,
              product: { select: { nameEn: true } },
            },
          },
        },
      },
    },
  });
}

/** True when the variant's product sits in one of the categories. */
export async function isVariantInCategories(variantId: string, categoryIds: readonly string[]) {
  if (categoryIds.length === 0) return false;
  const rows = await db.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
    WHERE v."id" = ${variantId}
      AND (p."categoryId" = ANY(${[...categoryIds]}::text[]) OR EXISTS (
        SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id" AND pc."categoryId" = ANY(${[...categoryIds]}::text[])
      ))
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * onHand movements (not reservations) per item between its snapshot and the
 * cut-off: its count time, or `fallback` for uncounted lines.
 */
export async function sumMovementsSinceSnapshot(
  client: InventoryUnitOfWork | null,
  locationId: string,
  items: ReadonlyArray<{ variantId: string; snapshotAt: Date; cutoff: Date }>,
): Promise<Map<string, number>> {
  if (items.length === 0) return new Map();
  const runner = client === null ? db : client.tx;
  const rows = await runner.$queryRaw<Array<{ variantId: string; total: bigint }>>`
    SELECT k.v AS "variantId", COALESCE(SUM(m."quantity"), 0)::bigint AS total
    FROM unnest(${items.map((item) => item.variantId)}::text[],
                ${items.map((item) => item.snapshotAt.toISOString())}::timestamptz[],
                ${items.map((item) => item.cutoff.toISOString())}::timestamptz[]) AS k(v, s, c)
    LEFT JOIN "InventoryMovement" m
      ON m."variantId" = k.v AND m."locationId" = ${locationId}
     AND m."type" NOT IN ('RESERVE', 'RELEASE')
     AND m."createdAt" > (k.s AT TIME ZONE 'UTC') AND m."createdAt" <= (k.c AT TIME ZONE 'UTC')
    GROUP BY k.v
  `;
  return new Map(rows.map((row) => [row.variantId, Number(row.total)]));
}

// ---------------------------------------------------------------------------
// writes (inside runInventoryTransaction)
// ---------------------------------------------------------------------------

/**
 * Snapshots what the system believes is on the shelf. The stock rows are
 * locked FOR SHARE first, so a sale still being written either finishes before
 * the snapshot (and is in it) or waits and is stamped after it.
 */
export async function snapshotLevels(
  uow: InventoryUnitOfWork,
  locationId: string,
  categoryIds: readonly string[] | undefined,
) {
  const scope =
    categoryIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND (p."categoryId" = ANY(${categoryIds.length === 0 ? [""] : [...categoryIds]}::text[]) OR EXISTS (
          SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id"
            AND pc."categoryId" = ANY(${categoryIds.length === 0 ? [""] : [...categoryIds]}::text[])))`;
  const rows = await uow.tx.$queryRaw<Array<{ variantId: string; onHand: number }>>`
    SELECT il."variantId", il."onHand"
    FROM "InventoryLevel" il
    JOIN "ProductVariant" v ON v."id" = il."variantId"
    JOIN "Product" p ON p."id" = v."productId"
    WHERE il."locationId" = ${locationId}
      AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL
      AND (il."onHand" > 0 OR il."reserved" > 0)
      ${scope}
    ORDER BY il."variantId", il."locationId"
    FOR SHARE OF il
  `;
  return { rows, at: await clock(uow) };
}

export async function clock(uow: InventoryUnitOfWork): Promise<Date> {
  const [row] = await uow.tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return row?.now ?? new Date();
}

export async function createStockCount(
  uow: InventoryUnitOfWork,
  data: {
    reference: string;
    locationId: string;
    categoryId: string | null;
    note: string | null;
    createdByUserId: string;
    startedAt: Date;
    items: ReadonlyArray<{ variantId: string; systemQty: number }>;
  },
) {
  return uow.tx.stockCount.create({
    data: {
      reference: data.reference,
      locationId: data.locationId,
      categoryId: data.categoryId,
      note: data.note,
      status: "IN_PROGRESS",
      createdByUserId: data.createdByUserId,
      startedAt: data.startedAt,
      items: {
        create: data.items.map((item) => ({
          variantId: item.variantId,
          systemQty: item.systemQty,
          snapshotAt: data.startedAt,
        })),
      },
    },
    select: { id: true, reference: true },
  });
}

/** Locks the count row; the first lock in any count transaction. */
export async function lockStockCount(uow: InventoryUnitOfWork, id: string) {
  const locked = await uow.tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockCount" WHERE "id" = ${id} FOR UPDATE
  `;
  if (locked.length === 0) return null;
  return uow.tx.stockCount.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      locationId: true,
      categoryId: true,
      items: {
        select: {
          id: true,
          variantId: true,
          systemQty: true,
          snapshotAt: true,
          countedQty: true,
          countedAt: true,
        },
      },
    },
  });
}

export async function addCountItem(
  uow: InventoryUnitOfWork,
  data: { stockCountId: string; variantId: string; systemQty: number; snapshotAt: Date },
) {
  return uow.tx.stockCountItem.create({ data, select: { id: true } });
}

export async function recordCountedQty(
  uow: InventoryUnitOfWork,
  itemId: string,
  value: { increment: number } | { set: number },
) {
  const at = await clock(uow);
  return uow.tx.stockCountItem.update({
    where: { id: itemId },
    data:
      "increment" in value
        ? { countedQty: { increment: value.increment }, countedAt: at }
        : { countedQty: value.set, countedAt: at },
    select: { id: true, countedQty: true },
  });
}

/** First scan of an item: countedQty starts at 1 (it was null). */
export async function startCountedQty(uow: InventoryUnitOfWork, itemId: string, value: number) {
  const at = await clock(uow);
  return uow.tx.stockCountItem.update({
    where: { id: itemId },
    data: { countedQty: value, countedAt: at },
    select: { id: true, countedQty: true },
  });
}

export async function saveCountLineResults(
  uow: InventoryUnitOfWork,
  lines: ReadonlyArray<{
    itemId: string;
    countedQty: number;
    countedAt: Date;
    movementsSinceSnapshot: number;
    differenceQty: number;
    movementId?: string | null;
  }>,
) {
  for (const line of lines) {
    await uow.tx.stockCountItem.update({
      where: { id: line.itemId },
      data: {
        countedQty: line.countedQty,
        countedAt: line.countedAt,
        movementsSinceSnapshot: line.movementsSinceSnapshot,
        differenceQty: line.differenceQty,
        ...(line.movementId === undefined ? {} : { movementId: line.movementId }),
      },
    });
  }
}

export async function updateStockCount(
  uow: InventoryUnitOfWork,
  id: string,
  data: Prisma.StockCountUncheckedUpdateInput,
) {
  await uow.tx.stockCount.update({ where: { id }, data });
}

/** P2002 on the "one open count per location" index. */
export function isOpenCountConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
    return false;
  return (
    JSON.stringify(error.meta ?? {}).includes("locationId") || error.message.includes("one_open")
  );
}

export async function findOpenCountAt(locationId: string) {
  return db.stockCount.findFirst({
    where: { locationId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } },
    select: { id: true, reference: true },
  });
}
