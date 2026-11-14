import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { InventoryUnitOfWork } from "./inventory.repository";

/** Stock transfers between locations: reads, and writes inside an inventory transaction. */

const userName = { select: { name: true, email: true } } as const;
const locationRef = {
  select: {
    id: true,
    code: true,
    nameEn: true,
    nameBn: true,
    addressEn: true,
    phone: true,
    isSample: true,
  },
} as const;

const transferDetailSelect = {
  id: true,
  reference: true,
  status: true,
  note: true,
  cancelReason: true,
  fromLocationId: true,
  toLocationId: true,
  createdAt: true,
  approvedAt: true,
  dispatchedAt: true,
  receivedAt: true,
  cancelledAt: true,
  fromLocation: locationRef,
  toLocation: locationRef,
  createdBy: userName,
  approvedBy: userName,
  dispatchedBy: userName,
  receivedBy: userName,
  cancelledBy: userName,
  items: {
    orderBy: { variant: { sku: "asc" } },
    select: {
      id: true,
      variantId: true,
      quantitySent: true,
      quantityReceived: true,
      discrepancyReason: true,
      note: true,
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
} satisfies Prisma.StockTransferSelect;

export type TransferDetailRow = Prisma.StockTransferGetPayload<{
  select: typeof transferDetailSelect;
}>;

function scopeWhere(scope: readonly string[] | undefined): Prisma.StockTransferWhereInput {
  if (scope === undefined) return {};
  return { OR: [{ fromLocationId: { in: [...scope] } }, { toLocationId: { in: [...scope] } }] };
}

export async function listTransfers(filter: {
  scope: readonly string[] | undefined;
  status?: Prisma.StockTransferWhereInput["status"];
  locationId?: string;
  skip: number;
  take: number;
}) {
  const where: Prisma.StockTransferWhereInput = {
    AND: [
      scopeWhere(filter.scope),
      filter.status === undefined ? {} : { status: filter.status },
      filter.locationId === undefined
        ? {}
        : { OR: [{ fromLocationId: filter.locationId }, { toLocationId: filter.locationId }] },
    ],
  };
  const [rows, total] = await Promise.all([
    db.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: filter.skip,
      take: filter.take,
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        dispatchedAt: true,
        receivedAt: true,
        fromLocation: { select: { code: true } },
        toLocation: { select: { code: true } },
        _count: { select: { items: true } },
        items: { select: { quantitySent: true, quantityReceived: true } },
      },
    }),
    db.stockTransfer.count({ where }),
  ]);
  return { rows, total };
}

export async function findTransfer(id: string) {
  return db.stockTransfer.findUnique({ where: { id }, select: transferDetailSelect });
}

/** Received lines whose quantity differs from what was sent. */
export async function findDiscrepancies(filter: {
  scope: readonly string[] | undefined;
  skip: number;
  take: number;
}) {
  const where: Prisma.StockTransferItemWhereInput = {
    discrepancyReason: { not: null },
    transfer: { status: "RECEIVED", ...scopeWhere(filter.scope) },
  };
  const [rows, total] = await Promise.all([
    db.stockTransferItem.findMany({
      where,
      orderBy: { transfer: { receivedAt: "desc" } },
      skip: filter.skip,
      take: filter.take,
      select: {
        id: true,
        quantitySent: true,
        quantityReceived: true,
        discrepancyReason: true,
        note: true,
        variant: {
          select: { id: true, sku: true, labelEn: true, product: { select: { nameEn: true } } },
        },
        transfer: {
          select: {
            id: true,
            reference: true,
            receivedAt: true,
            fromLocation: { select: { code: true } },
            toLocation: { select: { code: true } },
            receivedBy: userName,
          },
        },
      },
    }),
    db.stockTransferItem.count({ where }),
  ]);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// writes (inside runInventoryTransaction)
// ---------------------------------------------------------------------------

export async function createTransfer(
  uow: InventoryUnitOfWork,
  data: {
    reference: string;
    fromLocationId: string;
    toLocationId: string;
    note: string | null;
    createdByUserId: string;
    lines: ReadonlyArray<{ variantId: string; quantity: number }>;
  },
) {
  return uow.tx.stockTransfer.create({
    data: {
      reference: data.reference,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      note: data.note,
      createdByUserId: data.createdByUserId,
      items: {
        create: data.lines.map((line) => ({
          variantId: line.variantId,
          quantitySent: line.quantity,
        })),
      },
    },
    select: { id: true, reference: true },
  });
}

/** Locks the transfer row; the first lock in any transfer transaction. */
export async function lockTransfer(uow: InventoryUnitOfWork, id: string) {
  const locked = await uow.tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockTransfer" WHERE "id" = ${id} FOR UPDATE
  `;
  if (locked.length === 0) return null;
  return uow.tx.stockTransfer.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      fromLocationId: true,
      toLocationId: true,
      note: true,
      items: { select: { id: true, variantId: true, quantitySent: true } },
    },
  });
}

export async function replaceDraftLines(
  uow: InventoryUnitOfWork,
  transferId: string,
  data: {
    fromLocationId: string;
    toLocationId: string;
    note: string | null;
    lines: ReadonlyArray<{ variantId: string; quantity: number }>;
  },
) {
  await uow.tx.stockTransferItem.deleteMany({ where: { transferId } });
  await uow.tx.stockTransfer.update({
    where: { id: transferId },
    data: {
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      note: data.note,
      items: {
        create: data.lines.map((line) => ({
          variantId: line.variantId,
          quantitySent: line.quantity,
        })),
      },
    },
  });
}

export async function updateTransferState(
  uow: InventoryUnitOfWork,
  id: string,
  data: Prisma.StockTransferUncheckedUpdateInput,
) {
  await uow.tx.stockTransfer.update({ where: { id }, data });
}

export async function saveReceivedLines(
  uow: InventoryUnitOfWork,
  lines: ReadonlyArray<{
    itemId: string;
    quantityReceived: number;
    discrepancyReason: "LOST" | "DAMAGED" | "WRONG_ITEM" | "EXCESS" | null;
  }>,
) {
  for (const line of lines) {
    await uow.tx.stockTransferItem.update({
      where: { id: line.itemId },
      data: { quantityReceived: line.quantityReceived, discrepancyReason: line.discrepancyReason },
    });
  }
}
