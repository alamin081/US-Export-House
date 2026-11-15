import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { internalEan13 } from "./barcode";

type Client = Prisma.TransactionClient | typeof db;

/**
 * The next internal EAN-13 (29 + barcode_seq + check digit) that no variant
 * uses yet. A code someone typed by hand that happens to match is skipped.
 */
export async function nextFreeBarcode(client: Client): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [row] = await client.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('barcode_seq') AS value`;
    const code = internalEan13(Number(row?.value ?? 0));
    const taken = await client.productVariant.findUnique({
      where: { barcode: code },
      select: { id: true },
    });
    if (taken === null) return code;
  }
  throw new Error("Could not find a free barcode.");
}

/** Variants without a barcode (archived ones excluded), oldest first. */
export async function findVariantsWithoutBarcode(limit: number) {
  return db.productVariant.findMany({
    where: { barcode: null, deletedAt: null },
    select: { id: true, sku: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function countVariantsWithoutBarcode() {
  return db.productVariant.count({ where: { barcode: null, deletedAt: null } });
}

/**
 * Gives each listed variant a new barcode, only where it is still empty (a
 * barcode set in the meantime is never overwritten). Returns what was set.
 */
export async function assignMissingBarcodes(variantIds: readonly string[]) {
  return db.$transaction(async (tx) => {
    const assigned: Array<{ variantId: string; sku: string; barcode: string }> = [];
    for (const id of variantIds) {
      const barcode = await nextFreeBarcode(tx);
      const updated = await tx.productVariant.updateManyAndReturn({
        where: { id, barcode: null },
        data: { barcode },
        select: { id: true, sku: true, barcode: true },
      });
      const row = updated[0];
      if (row !== undefined) assigned.push({ variantId: row.id, sku: row.sku, barcode });
    }
    return assigned;
  });
}

/** What a barcode label prints, for the given variants. */
export async function findVariantsForLabels(ids: readonly string[]) {
  return db.productVariant.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      sku: true,
      barcode: true,
      pricePoisha: true,
      labelEn: true,
      product: { select: { nameEn: true, nameBn: true } },
      optionValues: {
        select: { optionValue: { select: { valueEn: true, option: { select: { type: true } } } } },
      },
    },
  });
}

/** Lines of a stock receipt or a transfer, as label quantities. */
export async function findDocumentQuantities(kind: "receipt" | "transfer", id: string) {
  if (kind === "transfer") {
    const rows = await db.stockTransferItem.findMany({
      where: { transferId: id },
      select: { variantId: true, quantitySent: true },
    });
    return rows.map((row) => ({ variantId: row.variantId, quantity: row.quantitySent }));
  }
  const receipt = await db.stockReceipt.findUnique({ where: { id }, select: { reference: true } });
  if (receipt === null) return [];
  const rows = await db.inventoryMovement.findMany({
    where: { referenceType: "RECEIPT", referenceId: id, quantity: { gt: 0 } },
    select: { variantId: true, quantity: true },
  });
  return rows.map((row) => ({ variantId: row.variantId, quantity: row.quantity }));
}

/** Variants of one product (live ones), for printing a product's labels. */
export async function findProductVariantIds(productId: string) {
  const rows = await db.productVariant.findMany({
    where: { productId, deletedAt: null },
    select: { id: true },
    orderBy: { sku: "asc" },
  });
  return rows.map((row) => row.id);
}
