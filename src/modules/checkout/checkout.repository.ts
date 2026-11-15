import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { reserveThrottleAttempt } from "@/modules/access/access.repository";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";

export { reserveThrottleAttempt };

/**
 * Data access for guest checkout. Reads that decide whether an order may be
 * placed run inside the order transaction (CheckoutTx), after the phone lock,
 * so two submits for the same phone are decided one after the other.
 */

export const COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  channel: true,
  labelEn: true,
  labelBn: true,
  minSubtotalPoisha: true,
  maxDiscountPoisha: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  usageLimitPerCustomer: true,
  usedCount: true,
  isActive: true,
  deletedAt: true,
  scopes: { select: { mode: true, categoryId: true, productId: true } },
} as const;

export type CouponRow = Prisma.CouponGetPayload<{ select: typeof COUPON_SELECT }>;

/** Case-insensitive, on the lower(code) unique index. */
async function couponIdByCode(client: Prisma.TransactionClient | typeof db, code: string) {
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Coupon" WHERE lower("code") = lower(${code}) LIMIT 1`;
  return rows[0]?.id ?? null;
}

/** Outside the order transaction: for showing a quote. */
export async function findCouponByCode(code: string): Promise<CouponRow | null> {
  const id = await couponIdByCode(db, code);
  if (id === null) return null;
  return db.coupon.findUnique({ where: { id }, select: COUPON_SELECT });
}

/** Orders by this phone that used the coupon; cancelled orders do not count. */
export async function countCouponUsesByPhone(couponId: string, phone: string) {
  return db.couponRedemption.count({
    where: { couponId, customerPhone: phone, order: { status: { not: "CANCELLED" } } },
  });
}

export async function findOrderByIdempotencyKey(key: string) {
  return db.order.findUnique({
    where: { idempotencyKey: key },
    select: { orderNumber: true, publicToken: true, totalPoisha: true },
  });
}

export async function recordCheckoutRejection(entry: {
  reason: string;
  phoneHash: string | null;
  ipHash: string | null;
}) {
  await db.checkoutRejection.create({ data: entry });
}

/** Current attempts in a throttle window, without adding one. */
export async function peekThrottle(key: string): Promise<number> {
  const row = await db.authThrottle.findUnique({
    where: { key },
    select: { attempts: true, expiresAt: true },
  });
  return row === null || row.expiresAt <= new Date() ? 0 : row.attempts;
}

// ---------------------------------------------------------------------------
// confirmation page and tracking
// ---------------------------------------------------------------------------

const ORDER_VIEW_SELECT = {
  orderNumber: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  customerName: true,
  customerPhone: true,
  subtotalPoisha: true,
  discountPoisha: true,
  shippingPoisha: true,
  totalPoisha: true,
  couponCode: true,
  zoneName: true,
  shipLine1: true,
  shipLandmark: true,
  shipDivisionName: true,
  shipDistrictName: true,
  shipUpazilaName: true,
  placedAt: true,
  confirmedAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  items: {
    select: {
      productNameEn: true,
      productNameBn: true,
      sku: true,
      imageUrl: true,
      sizeLabelEn: true,
      sizeLabelBn: true,
      colourLabelEn: true,
      colourLabelBn: true,
      unitPricePoisha: true,
      quantity: true,
      lineTotalPoisha: true,
    },
    orderBy: { id: "asc" },
  },
  statusHistory: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} as const;

export type OrderViewRow = Prisma.OrderGetPayload<{ select: typeof ORDER_VIEW_SELECT }>;

export async function findOrderByPublicToken(token: string): Promise<OrderViewRow | null> {
  return db.order.findUnique({ where: { publicToken: token }, select: ORDER_VIEW_SELECT });
}

/** Only when both the number and the phone match. */
export async function findOrderForTracking(
  orderNumber: string,
  phone: string,
): Promise<OrderViewRow | null> {
  return db.order.findFirst({
    where: { orderNumber, customerPhone: phone, channel: "ONLINE" },
    select: ORDER_VIEW_SELECT,
  });
}

// ---------------------------------------------------------------------------
// inside the order transaction
// ---------------------------------------------------------------------------

export interface NewOrder {
  id: string;
  orderNumber: string;
  publicToken: string;
  idempotencyKey: string;
  locationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  couponId: string | null;
  couponCode: string | null;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  shipLine1: string;
  shipLandmark: string | null;
  shipDivisionId: string;
  shipDivisionName: string;
  shipDistrictId: string;
  shipDistrictName: string;
  shipUpazilaId: string;
  shipUpazilaName: string;
  deliveryNote: string | null;
  placedIpHash: string | null;
  itemsFingerprint: string;
  reviewReasons: string[];
  items: Array<{
    variantId: string;
    productNameEn: string;
    productNameBn: string | null;
    variantLabel: string | null;
    sku: string;
    imageUrl: string | null;
    unitPricePoisha: number;
    quantity: number;
    lineTotalPoisha: number;
    compareAtPoisha: number | null;
    discountPoisha: number;
    sizeLabelEn: string | null;
    sizeLabelBn: string | null;
    colourLabelEn: string | null;
    colourLabelBn: string | null;
  }>;
}

export class CheckoutTx {
  private readonly tx: Prisma.TransactionClient;

  constructor(uow: InventoryUnitOfWork) {
    this.tx = uow.tx;
  }

  /** Serialises orders for one phone until this transaction ends. */
  async lockPhone(phone: string) {
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${phone}`}))`;
  }

  async findOrderByIdempotencyKey(key: string) {
    return this.tx.order.findUnique({
      where: { idempotencyKey: key },
      select: { orderNumber: true, publicToken: true, totalPoisha: true },
    });
  }

  async isPhoneBlocked(phone: string): Promise<boolean> {
    const row = await this.tx.blockedPhone.findUnique({
      where: { phone },
      select: { unblockedAt: true },
    });
    return row !== null && row.unblockedAt === null;
  }

  /** Pending or confirmed (not yet shipped) orders placed in the last 24 hours. */
  async countOpenOrdersForPhone(phone: string, since: Date) {
    return this.tx.order.count({
      where: {
        customerPhone: phone,
        channel: "ONLINE",
        status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] },
        placedAt: { gte: since },
      },
    });
  }

  async countOrdersFromIp(ipHash: string, since: Date) {
    return this.tx.order.count({ where: { placedIpHash: ipHash, placedAt: { gte: since } } });
  }

  async findDuplicate(phone: string, fingerprint: string, since: Date) {
    return this.tx.order.findFirst({
      where: {
        customerPhone: phone,
        itemsFingerprint: fingerprint,
        placedAt: { gte: since },
        status: { not: "CANCELLED" },
      },
      select: { orderNumber: true },
      orderBy: { placedAt: "desc" },
    });
  }

  async hasEarlierOrders(phone: string): Promise<boolean> {
    const count = await this.tx.order.count({
      where: { customerPhone: phone, status: { not: "CANCELLED" } },
    });
    return count > 0;
  }

  /** Locks the coupon row so its usage count cannot race. */
  async lockCouponByCode(code: string): Promise<CouponRow | null> {
    const id = await couponIdByCode(this.tx, code);
    if (id === null) return null;
    await this.tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`;
    return this.tx.coupon.findUnique({ where: { id }, select: COUPON_SELECT });
  }

  async countCouponUsesByPhone(couponId: string, phone: string) {
    return this.tx.couponRedemption.count({
      where: { couponId, customerPhone: phone, order: { status: { not: "CANCELLED" } } },
    });
  }

  /** +1 use, only while under the limit. False when the limit was reached. */
  async takeCouponUse(couponId: string): Promise<boolean> {
    const updated = await this.tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
      WHERE "id" = ${couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    return updated === 1;
  }

  /** Current prices, read inside the transaction (the final check). */
  async variantPrices(ids: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.tx.productVariant.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, pricePoisha: true },
    });
    return new Map(rows.map((row) => [row.id, row.pricePoisha]));
  }

  async defaultOnlineLocationId(): Promise<string | null> {
    const row = await this.tx.location.findFirst({
      where: { isDefaultOnlineFulfillment: true, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async nextOrderSequence(): Promise<number> {
    const rows = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('order_number_seq') AS value`;
    return Number(rows[0]?.value ?? 0);
  }

  async createOrder(order: NewOrder) {
    await this.tx.order.create({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        publicToken: order.publicToken,
        idempotencyKey: order.idempotencyKey,
        channel: "ONLINE",
        locationId: order.locationId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        status: "PENDING",
        paymentStatus: "UNPAID",
        paymentMethod: "COD",
        subtotalPoisha: order.subtotalPoisha,
        discountPoisha: order.discountPoisha,
        shippingPoisha: order.shippingPoisha,
        totalPoisha: order.totalPoisha,
        couponId: order.couponId,
        couponCode: order.couponCode,
        zoneId: order.zoneId,
        zoneCode: order.zoneCode,
        zoneName: order.zoneName,
        shipName: order.customerName,
        shipPhone: order.customerPhone,
        shipLine1: order.shipLine1,
        shipArea: order.shipUpazilaName,
        shipCity: order.shipDistrictName,
        shipLandmark: order.shipLandmark,
        shipDivisionId: order.shipDivisionId,
        shipDivisionName: order.shipDivisionName,
        shipDistrictId: order.shipDistrictId,
        shipDistrictName: order.shipDistrictName,
        shipUpazilaId: order.shipUpazilaId,
        shipUpazilaName: order.shipUpazilaName,
        deliveryNote: order.deliveryNote,
        placedIpHash: order.placedIpHash,
        itemsFingerprint: order.itemsFingerprint,
        reviewReasons: order.reviewReasons,
        items: { create: order.items },
        statusHistory: {
          create: { status: "PENDING", noteEn: "Order placed online (cash on delivery)." },
        },
        payments: {
          create: {
            provider: "COD",
            mode: "LIVE",
            status: "UNPAID",
            amountPoisha: order.totalPoisha,
          },
        },
        ...(order.couponId === null
          ? {}
          : {
              redemption: {
                create: {
                  couponId: order.couponId,
                  customerPhone: order.customerPhone,
                  discountPoisha: order.discountPoisha,
                },
              },
            }),
      },
    });
  }

  async deleteCart(cartId: string) {
    await this.tx.cart.deleteMany({ where: { id: cartId } });
  }
}

export function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes(field)
  );
}
