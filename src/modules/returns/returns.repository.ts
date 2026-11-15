import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { reserveThrottleAttempt } from "@/modules/access/access.repository";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";

export { reserveThrottleAttempt };

/**
 * Returns, exchanges and refunds. Changes run inside the order transaction
 * (`runInventoryTransaction`) with this lock order, extending orders.repository:
 *   1. the original Order row (FOR UPDATE, through OrderTx)
 *   2. the ReturnRequest row, then Refund rows
 *   3. InventoryLevel rows
 */

type Tx = Prisma.TransactionClient;

const RETURN_INCLUDE = {
  items: { include: { orderItem: true }, orderBy: { id: "asc" } },
  refunds: { orderBy: { createdAt: "asc" } },
  photos: { orderBy: { createdAt: "asc" } },
  exchangeOrder: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.ReturnRequestInclude;

export type LockedReturn = Prisma.ReturnRequestGetPayload<{ include: typeof RETURN_INCLUDE }>;

/** Requests that still hold units of the order (not rejected or cancelled). */
const HOLDING: Prisma.EnumReturnStatusFilter = { notIn: ["REJECTED", "CANCELLED"] };
/** Requests whose units have been valued (approved onwards). */
const VALUED: Prisma.EnumReturnStatusFilter = {
  in: ["APPROVED", "RECEIVED", "INSPECTED", "COMPLETED"],
};

export class ReturnTx {
  private readonly tx: Tx;

  constructor(uow: InventoryUnitOfWork) {
    this.tx = uow.tx;
  }

  async orderIdOfReturn(id: string): Promise<string | null> {
    const row = await this.tx.returnRequest.findUnique({
      where: { id },
      select: { orderId: true },
    });
    return row?.orderId ?? null;
  }

  async lockReturn(id: string): Promise<LockedReturn | null> {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ReturnRequest" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0) return null;
    return this.tx.returnRequest.findUnique({ where: { id }, include: RETURN_INCLUDE });
  }

  /** Units of each order line already in a request that still holds them. */
  async requestedUnits(orderId: string, exceptReturnId?: string): Promise<Map<string, number>> {
    const rows = await this.tx.returnItem.groupBy({
      by: ["orderItemId"],
      where: {
        returnRequest: {
          orderId,
          status: HOLDING,
          ...(exceptReturnId === undefined ? {} : { id: { not: exceptReturnId } }),
        },
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
  }

  /** Units of each order line already valued by an earlier approved request. */
  async creditedUnits(orderId: string, exceptReturnId: string): Promise<Map<string, number>> {
    const rows = await this.tx.returnItem.groupBy({
      by: ["orderItemId"],
      where: { returnRequest: { orderId, status: VALUED, id: { not: exceptReturnId } } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
  }

  async nextReference(): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('return_reference_seq') AS value`;
    return Number(row?.value ?? 0);
  }

  async nextOrderSequence(): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('order_number_seq') AS value`;
    return Number(row?.value ?? 0);
  }

  async createRequest(data: Prisma.ReturnRequestUncheckedCreateInput) {
    return this.tx.returnRequest.create({ data, select: { id: true, reference: true } });
  }

  async updateRequest(id: string, data: Prisma.ReturnRequestUncheckedUpdateInput) {
    await this.tx.returnRequest.update({ where: { id }, data });
  }

  async updateItem(id: string, data: Prisma.ReturnItemUncheckedUpdateInput) {
    await this.tx.returnItem.update({ where: { id }, data });
  }

  async addPhotos(
    returnRequestId: string,
    photos: ReadonlyArray<{ provider: string; key: string; url: string }>,
  ) {
    if (photos.length === 0) return;
    await this.tx.returnPhoto.createMany({
      data: photos.map((photo) => ({ ...photo, returnRequestId })),
    });
  }

  async defaultOnlineLocationId(): Promise<string | null> {
    const row = await this.tx.location.findFirst({
      where: { isDefaultOnlineFulfillment: true, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createOrder(data: Prisma.OrderUncheckedCreateInput) {
    return this.tx.order.create({ data, select: { id: true, orderNumber: true } });
  }

  // --- refunds ------------------------------------------------------------------

  async lockRefund(id: string) {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Refund" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0) return null;
    return this.tx.refund.findUnique({ where: { id } });
  }

  async refundIdsOfOrder(refundId: string): Promise<string | null> {
    const row = await this.tx.refund.findUnique({
      where: { id: refundId },
      select: { orderId: true },
    });
    return row?.orderId ?? null;
  }

  async shippingRefunded(orderId: string): Promise<boolean> {
    const count = await this.tx.refund.count({
      where: { orderId, shippingRefundPoisha: { gt: 0 }, status: { in: ["PENDING", "COMPLETED"] } },
    });
    return count > 0;
  }

  async createRefund(data: Prisma.RefundUncheckedCreateInput) {
    return this.tx.refund.create({ data, select: { id: true } });
  }

  async updateRefund(id: string, data: Prisma.RefundUncheckedUpdateInput) {
    await this.tx.refund.update({ where: { id }, data });
  }

  /** Adds a completed refund to the order (the CHECK keeps it within what was paid). */
  async addRefundToOrder(
    orderId: string,
    amountPoisha: number,
    paymentStatus: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED",
  ) {
    await this.tx.order.update({
      where: { id: orderId },
      data: {
        refundedPoisha: { increment: amountPoisha },
        paymentStatus,
        version: { increment: 1 },
      },
    });
    await this.tx.payment.updateMany({
      where: {
        orderId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        provider: { not: "EXCHANGE_CREDIT" },
      },
      data: { status: paymentStatus },
    });
  }

  async firstPaidPaymentId(orderId: string): Promise<string | null> {
    const row = await this.tx.payment.findFirst({
      where: { orderId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function findReturnDetail(id: string) {
  return db.returnRequest.findUnique({
    where: { id },
    include: {
      ...RETURN_INCLUDE,
      order: {
        select: {
          id: true,
          orderNumber: true,
          channel: true,
          status: true,
          locationId: true,
          customerName: true,
          customerPhone: true,
          paidPoisha: true,
          refundedPoisha: true,
          shippingPoisha: true,
          deliveredAt: true,
          paymentStatus: true,
        },
      },
    },
  });
}

export type ReturnDetailRow = NonNullable<Awaited<ReturnType<typeof findReturnDetail>>>;

export async function listReturns(filter: {
  statuses: readonly string[];
  search: string | null;
  locationIds: readonly string[] | undefined;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.ReturnRequestWhereInput = {
    ...(filter.statuses.length === 0
      ? {}
      : { status: { in: filter.statuses as Prisma.EnumReturnStatusFilter["in"] } }),
    ...(filter.locationIds === undefined
      ? {}
      : { order: { locationId: { in: [...filter.locationIds] } } }),
    ...(filter.search === null
      ? {}
      : {
          OR: [
            { reference: { contains: filter.search, mode: "insensitive" } },
            { order: { orderNumber: { contains: filter.search, mode: "insensitive" } } },
          ],
        }),
  };
  const [rows, total] = await Promise.all([
    db.returnRequest.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, customerName: true } },
        items: { select: { quantity: true } },
      },
      orderBy: { requestedAt: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    db.returnRequest.count({ where }),
  ]);
  return { rows, total };
}

export async function listPendingRefunds(locationIds: readonly string[] | undefined) {
  return db.refund.findMany({
    where: {
      status: "PENDING",
      ...(locationIds === undefined ? {} : { order: { locationId: { in: [...locationIds] } } }),
    },
    include: {
      order: { select: { id: true, orderNumber: true, customerName: true } },
      returnRequest: { select: { id: true, reference: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** An order with what a return request needs: lines, earlier requests, the product of each line. */
export async function findOrderForReturn(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: { variant: { select: { productId: true } } },
      },
      returnRequests: {
        where: { status: HOLDING },
        include: { items: { select: { orderItemId: true, quantity: true } } },
      },
    },
  });
}

/** Live variants of the given products (exchange choices). */
export async function findProductVariants(productIds: readonly string[]) {
  if (productIds.length === 0) return [];
  return db.productVariant.findMany({
    where: {
      productId: { in: [...productIds] },
      isActive: true,
      deletedAt: null,
      product: { status: "PUBLISHED", deletedAt: null },
    },
    select: {
      id: true,
      productId: true,
      sku: true,
      labelEn: true,
      labelBn: true,
      pricePoisha: true,
    },
    orderBy: { sku: "asc" },
  });
}

/** Credit carried to an exchange order (its EXCHANGE_CREDIT payment). */
export async function findExchangeCreditPayment(orderId: string): Promise<number> {
  const row = await db.payment.aggregate({
    where: { orderId, provider: "EXCHANGE_CREDIT", status: "PAID" },
    _sum: { amountPoisha: true },
  });
  return row._sum.amountPoisha ?? 0;
}

export async function findReturnPolicyPage() {
  return db.page.findUnique({
    where: { slug: "shipping-returns" },
    select: { id: true, status: true, publishedAt: true },
  });
}

export async function setReturnPolicyPublished(published: boolean, userId: string) {
  return db.$transaction(async (tx) => {
    const page = await tx.page.upsert({
      where: { slug: "shipping-returns" },
      create: {
        slug: "shipping-returns",
        titleEn: "Shipping & returns",
        status: published ? "PUBLISHED" : "DRAFT",
        publishedAt: published ? new Date() : null,
        lastUpdatedUserId: userId,
      },
      update: {
        status: published ? "PUBLISHED" : "DRAFT",
        publishedAt: published ? new Date() : null,
        lastUpdatedUserId: userId,
      },
      select: { id: true },
    });
    await tx.setting.upsert({
      where: { key: "returns.policyApproved" },
      create: {
        key: "returns.policyApproved",
        valueType: "BOOLEAN",
        value: String(published),
        group: "returns",
        updatedByUserId: userId,
      },
      update: { value: String(published), updatedByUserId: userId },
    });
    return page;
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
