import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { COUPON_SELECT, type CouponRow } from "@/modules/checkout/checkout.repository";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";
import type { OrderStatus } from "./order-state";

/**
 * Orders after checkout (Phase 9). Reads for the admin, and `OrderTx` for
 * every change, used inside `runInventoryTransaction` so stock and order
 * rows commit together.
 *
 * Locking (with Phase 7-8, see inventory.repository.ts): inside one
 * transaction, rows are locked in this order, each group sorted by id:
 *   1. Order rows (FOR UPDATE)
 *   2. the Coupon row, if the coupon changes
 *   3. InventoryLevel rows, by (variantId, locationId)
 * Checkout never locks an existing order, so it cannot wait on us in a cycle.
 */

type Tx = Prisma.TransactionClient;

const LOCKED_ORDER_INCLUDE = {
  items: { orderBy: { id: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  shipments: { orderBy: { createdAt: "desc" } },
  invoices: { where: { isCurrent: true } },
  redemption: true,
  codItem: { select: { id: true } },
  exchangeFor: { select: { reference: true, status: true } },
  location: { select: { id: true, code: true, nameEn: true } },
} satisfies Prisma.OrderInclude;

export type LockedOrder = Prisma.OrderGetPayload<{ include: typeof LOCKED_ORDER_INCLUDE }>;

const SEQUENCES = {
  invoice: Prisma.raw(`'invoice_number_seq'`),
  cod: Prisma.raw(`'cod_settlement_seq'`),
} as const;

export class OrderTx {
  private readonly tx: Tx;

  constructor(uow: InventoryUnitOfWork) {
    this.tx = uow.tx;
  }

  /** Locks one order row and returns it with everything a change needs. */
  async lockOrder(id: string): Promise<LockedOrder | null> {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0) return null;
    return this.tx.order.findUnique({ where: { id }, include: LOCKED_ORDER_INCLUDE });
  }

  /** Locks several orders in id order (the global lock order). */
  async lockOrders(ids: readonly string[]): Promise<LockedOrder[]> {
    const sorted = [...new Set(ids)].sort();
    if (sorted.length === 0) return [];
    await this.tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ANY(${sorted}::text[]) ORDER BY "id" FOR UPDATE`;
    return this.tx.order.findMany({
      where: { id: { in: sorted } },
      include: LOCKED_ORDER_INCLUDE,
      orderBy: { id: "asc" },
    });
  }

  /** Every change bumps the version, so a form opened earlier is refused. */
  async updateOrder(id: string, data: Prisma.OrderUncheckedUpdateInput) {
    await this.tx.order.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }

  async addHistory(entry: {
    orderId: string;
    status: OrderStatus;
    event?: string | null;
    noteEn?: string | null;
    userId: string | null;
  }) {
    await this.tx.orderStatusHistory.create({
      data: {
        orderId: entry.orderId,
        status: entry.status,
        event: entry.event ?? null,
        noteEn: entry.noteEn ?? null,
        userId: entry.userId,
      },
    });
  }

  // --- calls and notes --------------------------------------------------------

  async lastCountedCall(orderId: string) {
    return this.tx.orderCallLog.findFirst({
      where: { orderId, counted: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
  }

  async countCountedCalls(orderId: string) {
    return this.tx.orderCallLog.count({ where: { orderId, counted: true } });
  }

  async addCall(data: {
    orderId: string;
    userId: string;
    outcome: Prisma.OrderCallLogUncheckedCreateInput["outcome"];
    note: string | null;
    callbackAt: Date | null;
    counted: boolean;
    createdAt: Date;
  }) {
    return this.tx.orderCallLog.create({ data, select: { id: true } });
  }

  // --- coupon -----------------------------------------------------------------

  async lockCoupon(id: string): Promise<CouponRow | null> {
    await this.tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`;
    return this.tx.coupon.findUnique({ where: { id }, select: COUPON_SELECT });
  }

  /** Gives one use back (cancelled order, or the coupon fell off in an edit). */
  async returnCouponUse(couponId: string) {
    await this.tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now()
      WHERE "id" = ${couponId}`;
  }

  async deleteRedemption(orderId: string) {
    await this.tx.couponRedemption.deleteMany({ where: { orderId } });
  }

  async updateRedemption(orderId: string, discountPoisha: number) {
    await this.tx.couponRedemption.updateMany({ where: { orderId }, data: { discountPoisha } });
  }

  // --- lines ------------------------------------------------------------------

  /** Replaces the lines of an order that has not been packed (no returns can point at them). */
  async replaceItems(orderId: string, items: Prisma.OrderItemCreateManyOrderInput[]) {
    await this.tx.orderItem.deleteMany({ where: { orderId } });
    await this.tx.orderItem.createMany({ data: items.map((item) => ({ ...item, orderId })) });
  }

  /** Today's prices, read inside the transaction. */
  async variantPrices(ids: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.tx.productVariant.findMany({
      where: { id: { in: [...ids] }, isActive: true, deletedAt: null },
      select: { id: true, pricePoisha: true },
    });
    return new Map(rows.map((row) => [row.id, row.pricePoisha]));
  }

  async setCodPaymentAmount(orderId: string, amountPoisha: number) {
    await this.tx.payment.updateMany({
      where: { orderId, provider: "COD", status: "UNPAID" },
      data: { amountPoisha },
    });
  }

  async findActiveLocation(id: string) {
    return this.tx.location.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: { id: true, code: true, nameEn: true, isOnlineFulfillment: true },
    });
  }

  async blockPhone(phone: string, reason: string, userId: string) {
    return this.tx.blockedPhone.upsert({
      where: { phone },
      create: { phone, reason, blockedByUserId: userId },
      update: { reason, blockedByUserId: userId, unblockedAt: null, unblockedByUserId: null },
      select: { id: true },
    });
  }

  // --- shipments ----------------------------------------------------------------

  async createShipment(data: Prisma.ShipmentUncheckedCreateInput) {
    return this.tx.shipment.create({ data, select: { id: true } });
  }

  async updateShipment(id: string, data: Prisma.ShipmentUncheckedUpdateInput) {
    await this.tx.shipment.update({ where: { id }, data });
  }

  async addShipmentEvent(data: {
    shipmentId: string;
    status: Prisma.ShipmentEventUncheckedCreateInput["status"];
    note: string | null;
  }) {
    await this.tx.shipmentEvent.create({ data: { ...data, source: "manual" } });
  }

  // --- documents ----------------------------------------------------------------

  async nextSequence(name: keyof typeof SEQUENCES): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval(${SEQUENCES[name]}) AS value`;
    return Number(row?.value ?? 0);
  }

  async createInvoice(data: {
    number: string;
    orderId: string;
    version: number;
    /** Plain JSON (the invoice snapshot). */
    snapshot: object;
    reason: string | null;
    issuedByUserId: string | null;
    issuedAt: Date;
  }) {
    await this.tx.invoice.updateMany({
      where: { orderId: data.orderId, isCurrent: true },
      data: { isCurrent: false },
    });
    return this.tx.invoice.create({
      data: { ...data, snapshot: data.snapshot as Prisma.InputJsonValue, isCurrent: true },
      select: { id: true },
    });
  }

  /** What an invoice prints, read inside the transaction that issues it. */
  async invoiceSource(orderId: string) {
    return this.tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { orderBy: { id: "asc" } },
        payments: { where: { status: "PAID" }, orderBy: { createdAt: "asc" } },
        location: { select: { nameEn: true } },
        soldBy: { select: { name: true } },
      },
    });
  }

  // --- courier cash -------------------------------------------------------------

  async createSettlement(data: Prisma.CodSettlementUncheckedCreateInput) {
    return this.tx.codSettlement.create({ data, select: { id: true, reference: true } });
  }

  async markCodPaid(orderId: string, reference: string, paidAt: Date) {
    await this.tx.payment.updateMany({
      where: { orderId, provider: "COD", status: "UNPAID" },
      data: { status: "PAID", paidAt, providerReference: reference },
    });
  }
}

// ---------------------------------------------------------------------------
// reads for the admin
// ---------------------------------------------------------------------------

export interface OrderListFilter {
  statuses: readonly OrderStatus[];
  search: string | null;
  /** False without customer.read: searching by phone or name would reveal who ordered. */
  searchPersonal: boolean;
  from: Date | null;
  to: Date | null;
  zoneCode: string | null;
  couponCode: string | null;
  reviewOnly: boolean;
  unreachableOnly: boolean;
  locationId: string | null;
  /** undefined = every location; otherwise only these. */
  locationIds: readonly string[] | undefined;
  page: number;
  pageSize: number;
}

function listWhere(filter: OrderListFilter): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [{ channel: "ONLINE" }];
  if (filter.statuses.length > 0) and.push({ status: { in: [...filter.statuses] } });
  if (filter.locationIds !== undefined) and.push({ locationId: { in: [...filter.locationIds] } });
  if (filter.locationId !== null) and.push({ locationId: filter.locationId });
  if (filter.reviewOnly) and.push({ NOT: { reviewReasons: { isEmpty: true } } });
  if (filter.unreachableOnly) and.push({ unreachableAt: { not: null } });
  if (filter.zoneCode !== null) and.push({ zoneCode: filter.zoneCode });
  if (filter.couponCode !== null) and.push({ couponCode: filter.couponCode });
  if (filter.from !== null) and.push({ placedAt: { gte: filter.from } });
  if (filter.to !== null) and.push({ placedAt: { lt: filter.to } });
  if (filter.search !== null) {
    and.push({
      OR: [
        { orderNumber: { contains: filter.search, mode: "insensitive" } },
        ...(filter.searchPersonal
          ? [
              { customerPhone: { contains: filter.search } },
              { customerName: { contains: filter.search, mode: "insensitive" as const } },
            ]
          : []),
      ],
    });
  }
  return { AND: and };
}

export async function listOrders(filter: OrderListFilter) {
  const where = listWhere(filter);
  // The queue works oldest first; finished orders read newest first.
  const oldestFirst =
    filter.statuses.length > 0 &&
    filter.statuses.every((status) => ["PENDING", "CONFIRMED", "PROCESSING"].includes(status));
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        customerName: true,
        customerPhone: true,
        totalPoisha: true,
        zoneName: true,
        shipDistrictName: true,
        couponCode: true,
        reviewReasons: true,
        unreachableAt: true,
        packedAt: true,
        placedAt: true,
        version: true,
        location: { select: { code: true } },
        _count: { select: { items: true, callLogs: true } },
      },
      orderBy: [
        ...(filter.statuses.includes("PENDING")
          ? [{ reviewReasons: "desc" as const } satisfies Prisma.OrderOrderByWithRelationInput]
          : []),
        { placedAt: oldestFirst ? "asc" : "desc" },
      ],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    db.order.count({ where }),
  ]);
  return { rows, total };
}

/** Per-status counts for the tab badges, within the staff member's locations. */
export async function countOrdersByStatus(locationIds: readonly string[] | undefined) {
  const rows = await db.order.groupBy({
    by: ["status"],
    where: {
      channel: "ONLINE",
      ...(locationIds === undefined ? {} : { locationId: { in: [...locationIds] } }),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.status as OrderStatus, row._count._all]));
}

export async function findOrderDetail(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { id: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: {
        select: {
          id: true,
          provider: true,
          mode: true,
          status: true,
          amountPoisha: true,
          providerReference: true,
          paidAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      shipments: {
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { occurredAt: "asc" } } },
      },
      callLogs: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      invoices: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          number: true,
          version: true,
          isCurrent: true,
          reason: true,
          issuedAt: true,
        },
      },
      codItem: { include: { settlement: { select: { reference: true, receivedOn: true } } } },
      location: { select: { id: true, code: true, nameEn: true, isSample: true } },
      returnRequests: {
        select: { id: true, reference: true, status: true, type: true },
        orderBy: { requestedAt: "desc" },
      },
      exchangeFor: {
        select: { id: true, reference: true, order: { select: { id: true, orderNumber: true } } },
      },
    },
  });
}

export type OrderDetailRow = NonNullable<Awaited<ReturnType<typeof findOrderDetail>>>;

/** Names for the user ids shown on an order page (history, calls, notes). */
export async function findUserNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(rows.map((row) => [row.id, row.name ?? row.email ?? "Staff"]));
}

/** Online-fulfilment locations, for the "ship from" picker. */
export async function findFulfilmentLocations() {
  return db.location.findMany({
    where: { isActive: true, deletedAt: null, isOnlineFulfillment: true },
    select: { id: true, code: true, nameEn: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
}

/** Orders for printing (packing slips, address labels), in the given order. */
export async function findOrdersForPrint(ids: readonly string[]) {
  const rows = await db.order.findMany({
    where: { id: { in: [...ids] } },
    include: {
      items: { orderBy: { id: "asc" } },
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
      location: { select: { id: true, code: true, nameEn: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row) => row !== undefined);
}

// ---------------------------------------------------------------------------
// customers (guests are identified by phone)
// ---------------------------------------------------------------------------

export async function findCustomerPhoneOfOrder(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: { customerPhone: true, customerName: true, locationId: true },
  });
}

export async function findCustomerStats(phone: string) {
  const [byStatus, spent, blocked, notes, orders] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: { customerPhone: phone },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { customerPhone: phone, status: { in: ["DELIVERED"] } },
      _sum: { totalPoisha: true, refundedPoisha: true },
    }),
    db.blockedPhone.findUnique({
      where: { phone },
      select: { reason: true, unblockedAt: true, createdAt: true },
    }),
    db.customerNote.findMany({ where: { phone }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.order.findMany({
      where: { customerPhone: phone },
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        paymentStatus: true,
        totalPoisha: true,
        placedAt: true,
        locationId: true,
      },
      orderBy: { placedAt: "desc" },
      take: 100,
    }),
  ]);
  return { byStatus, spent, blocked, notes, orders };
}

/** Delivery failures for a phone, shown on the order page as a warning. */
export async function countDeliveryFailures(phone: string) {
  return db.order.count({
    where: { customerPhone: phone, OR: [{ deliveryFailedAt: { not: null } }] },
  });
}

export async function addCustomerNote(phone: string, body: string, userId: string) {
  return db.customerNote.create({ data: { phone, body, userId }, select: { id: true } });
}

export async function addOrderNote(orderId: string, body: string, userId: string) {
  return db.orderNote.create({ data: { orderId, body, userId }, select: { id: true } });
}

/** Customers with their order counts, newest activity first. */
export async function listCustomers(input: {
  search: string | null;
  page: number;
  pageSize: number;
  locationIds: readonly string[] | undefined;
}) {
  const where: Prisma.OrderWhereInput = {
    // Walk-in till sales without a phone are not a customer record.
    customerPhone: { not: "" },
    ...(input.locationIds === undefined ? {} : { locationId: { in: [...input.locationIds] } }),
    ...(input.search === null
      ? {}
      : {
          OR: [
            { customerPhone: { contains: input.search } },
            { customerName: { contains: input.search, mode: "insensitive" } },
          ],
        }),
  };
  const groups = await db.order.groupBy({
    by: ["customerPhone"],
    where,
    _count: { _all: true },
    _max: { placedAt: true },
    orderBy: { _max: { placedAt: "desc" } },
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  });
  const totalGroups = await db.order.groupBy({ by: ["customerPhone"], where });
  const latest = await db.order.findMany({
    where: { customerPhone: { in: groups.map((group) => group.customerPhone) } },
    select: { id: true, customerPhone: true, customerName: true, placedAt: true },
    orderBy: { placedAt: "desc" },
  });
  const latestByPhone = new Map<string, (typeof latest)[number]>();
  for (const row of latest) {
    if (!latestByPhone.has(row.customerPhone)) latestByPhone.set(row.customerPhone, row);
  }
  return {
    total: totalGroups.length,
    rows: groups.map((group) => ({
      phone: group.customerPhone,
      orders: group._count._all,
      lastOrderAt: group._max.placedAt,
      latestOrderId: latestByPhone.get(group.customerPhone)?.id ?? null,
      name: latestByPhone.get(group.customerPhone)?.customerName ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// courier cash
// ---------------------------------------------------------------------------

/** Delivered COD orders whose money has not been settled yet. */
export async function findUnsettledCodOrders(locationIds: readonly string[] | undefined) {
  return db.order.findMany({
    where: {
      channel: "ONLINE",
      status: "DELIVERED",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      codItem: null,
      ...(locationIds === undefined ? {} : { locationId: { in: [...locationIds] } }),
    },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      totalPoisha: true,
      deliveredAt: true,
      shipments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          courier: true,
          courierName: true,
          trackingCode: true,
          codAmountPoisha: true,
        },
      },
    },
    orderBy: { deliveredAt: "asc" },
    take: 500,
  });
}

export async function listSettlements(limit = 50) {
  return db.codSettlement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: { include: { order: { select: { id: true, orderNumber: true } } } },
    },
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
