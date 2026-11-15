import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { COUPON_SELECT, type CouponRow } from "@/modules/checkout/checkout.repository";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";

/**
 * The till. A sale runs in one `runInventoryTransaction` and locks, in order:
 *   1. the PosSession row FOR SHARE (closing the day takes FOR UPDATE, so a
 *      sale and a close never overlap)
 *   2. the Coupon row FOR UPDATE, if a coupon is used
 *   3. InventoryLevel rows (global order)
 */

type Tx = Prisma.TransactionClient;

export class PosTx {
  private readonly tx: Tx;

  constructor(uow: InventoryUnitOfWork) {
    this.tx = uow.tx;
  }

  async lockSession(id: string, mode: "share" | "update") {
    const lock = mode === "share" ? Prisma.sql`FOR SHARE` : Prisma.sql`FOR UPDATE`;
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PosSession" WHERE "id" = ${id} ${lock}`;
    if (rows.length === 0) return null;
    return this.tx.posSession.findUnique({
      where: { id },
      include: { location: { select: { id: true, code: true, nameEn: true } } },
    });
  }

  async findOrderByIdempotencyKey(key: string) {
    return this.tx.order.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, orderNumber: true, totalPoisha: true, posSessionId: true },
    });
  }

  async lockCouponByCode(code: string): Promise<CouponRow | null> {
    const found = await this.tx.coupon.findFirst({
      where: { code, deletedAt: null },
      select: { id: true },
    });
    if (found === null) return null;
    await this.tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${found.id} FOR UPDATE`;
    return this.tx.coupon.findUnique({ where: { id: found.id }, select: COUPON_SELECT });
  }

  async takeCouponUse(couponId: string): Promise<boolean> {
    const updated = await this.tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
      WHERE "id" = ${couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    return updated === 1;
  }

  async variantPrices(ids: readonly string[]) {
    const rows = await this.tx.productVariant.findMany({
      where: { id: { in: [...ids] }, isActive: true, deletedAt: null },
      select: { id: true, pricePoisha: true },
    });
    return new Map(rows.map((row) => [row.id, row.pricePoisha]));
  }

  async nextOrderSequence(): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('order_number_seq') AS value`;
    return Number(row?.value ?? 0);
  }

  async nextSessionSequence(): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('pos_session_seq') AS value`;
    return Number(row?.value ?? 0);
  }

  async createSale(data: Prisma.OrderUncheckedCreateInput) {
    return this.tx.order.create({ data, select: { id: true, orderNumber: true } });
  }

  async createSession(data: Prisma.PosSessionUncheckedCreateInput) {
    return this.tx.posSession.create({ data, select: { id: true, reference: true } });
  }

  async closeSession(id: string, data: Prisma.PosSessionUncheckedUpdateInput) {
    await this.tx.posSession.update({ where: { id }, data });
    await this.tx.posHeldBill.deleteMany({ where: { sessionId: id } });
  }

  /** Everything the day's figures are built from, read inside the closing transaction. */
  async sessionFigures(sessionId: string) {
    const [sales, payments, refunds] = await Promise.all([
      this.tx.order.findMany({
        where: { posSessionId: sessionId },
        select: { subtotalPoisha: true, discountPoisha: true, totalPoisha: true },
      }),
      this.tx.payment.findMany({
        where: { posSessionId: sessionId },
        select: { provider: true, amountPoisha: true },
      }),
      this.tx.refund.findMany({
        where: { posSessionId: sessionId, status: "COMPLETED" },
        select: { method: true, amountPoisha: true },
      }),
    ]);
    return { sales, payments, refunds };
  }
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function findOpenSessions(locationIds: readonly string[] | undefined) {
  return db.posSession.findMany({
    where: {
      status: "OPEN",
      ...(locationIds === undefined ? {} : { locationId: { in: [...locationIds] } }),
    },
    select: {
      id: true,
      reference: true,
      locationId: true,
      counterCode: true,
      openedAt: true,
      openingFloatPoisha: true,
    },
  });
}

export async function findSession(id: string) {
  return db.posSession.findUnique({
    where: { id },
    include: { location: { select: { id: true, code: true, nameEn: true } } },
  });
}

export async function findSessionFigures(sessionId: string) {
  const [sales, payments, refunds] = await Promise.all([
    db.order.findMany({
      where: { posSessionId: sessionId },
      select: {
        id: true,
        orderNumber: true,
        subtotalPoisha: true,
        discountPoisha: true,
        totalPoisha: true,
        placedAt: true,
        invoices: { where: { isCurrent: true }, select: { number: true } },
      },
      orderBy: { placedAt: "asc" },
    }),
    db.payment.findMany({
      where: { posSessionId: sessionId },
      select: { provider: true, amountPoisha: true },
    }),
    db.refund.findMany({
      where: { posSessionId: sessionId, status: "COMPLETED" },
      select: { method: true, amountPoisha: true },
    }),
  ]);
  return { sales, payments, refunds };
}

export async function listRecentSessions(locationIds: readonly string[] | undefined, limit = 30) {
  return db.posSession.findMany({
    where: locationIds === undefined ? {} : { locationId: { in: [...locationIds] } },
    include: { location: { select: { code: true } } },
    orderBy: { openedAt: "desc" },
    take: limit,
  });
}

/** One variant by barcode or SKU, with what the till needs. */
export async function findTillVariant(code: string) {
  return db.productVariant.findFirst({
    where: {
      deletedAt: null,
      OR: [{ barcode: code }, { sku: { equals: code, mode: "insensitive" } }],
    },
    select: TILL_VARIANT_SELECT,
  });
}

export async function searchTillVariants(term: string) {
  return db.productVariant.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term } },
        { product: { nameEn: { contains: term, mode: "insensitive" } } },
      ],
    },
    select: TILL_VARIANT_SELECT,
    take: 20,
    orderBy: { sku: "asc" },
  });
}

const TILL_VARIANT_SELECT = {
  id: true,
  sku: true,
  barcode: true,
  pricePoisha: true,
  isActive: true,
  labelEn: true,
  product: { select: { nameEn: true, status: true, deletedAt: true } },
} satisfies Prisma.ProductVariantSelect;

/** A manager who may allow a larger discount, found by email, with their PIN hash. */
export async function findApprover(email: string) {
  return db.user.findFirst({
    where: { email: email.toLowerCase(), kind: "STAFF", isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      posPinHash: true,
      role: { select: { permissions: true, allLocations: true, deletedAt: true } },
      locationAccess: { select: { locationId: true } },
    },
  });
}

export async function setPinHash(userId: string, hash: string | null) {
  await db.user.update({ where: { id: userId }, data: { posPinHash: hash } });
}

export async function findPasswordHash(userId: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return row?.passwordHash ?? null;
}

// --- held bills ------------------------------------------------------------------

export async function createHeldBill(data: {
  sessionId: string;
  userId: string;
  label: string;
  cart: Prisma.InputJsonValue;
}) {
  return db.posHeldBill.create({ data, select: { id: true } });
}

export async function listHeldBills(sessionId: string) {
  return db.posHeldBill.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
}

export async function takeHeldBill(id: string, sessionId: string) {
  return db.$transaction(async (tx) => {
    const row = await tx.posHeldBill.findFirst({ where: { id, sessionId } });
    if (row !== null) await tx.posHeldBill.delete({ where: { id } });
    return row;
  });
}

// --- receipts -------------------------------------------------------------------

export async function findSaleForReceipt(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      invoices: { where: { isCurrent: true } },
      location: {
        select: { id: true, code: true, nameEn: true, nameBn: true, addressEn: true, phone: true },
      },
      soldBy: { select: { name: true } },
    },
  });
}

export async function findSaleByNumber(text: string) {
  const upper = text.trim().toUpperCase();
  const invoice = await db.invoice.findFirst({
    where: { number: upper },
    select: { orderId: true },
  });
  if (invoice !== null) return invoice.orderId;
  const order = await db.order.findUnique({ where: { orderNumber: upper }, select: { id: true } });
  return order?.id ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** The database refused a change to a closed till day (pos_guard_* triggers). */
export function isClosedDayError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  return text.includes("POS_DAY_CLOSED");
}
