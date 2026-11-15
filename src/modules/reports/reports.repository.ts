import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Channel } from "./report-math";

/**
 * Report queries (Phase 12). Every function takes the location scope already
 * narrowed by the service: `undefined` means every location, otherwise only
 * these ids (an empty list matches nothing). Dates are half-open [from, to).
 *
 * Day keys are computed in SQL as the Dhaka calendar date:
 * `(ts + interval '6 hours')::date` — timestamps are stored in UTC.
 */

export interface ReportScope {
  from: Date;
  to: Date;
  locationIds: readonly string[] | undefined;
  channel: Channel | null;
}

const NONE = "__none__";

function locationSql(column: Prisma.Sql, ids: readonly string[] | undefined): Prisma.Sql {
  if (ids === undefined) return Prisma.sql`TRUE`;
  return Prisma.sql`${column} IN (${Prisma.join(ids.length === 0 ? [NONE] : [...ids])})`;
}

function channelSql(column: Prisma.Sql, channel: Channel | null): Prisma.Sql {
  return channel === null ? Prisma.sql`TRUE` : Prisma.sql`${column} = ${channel}::"SalesChannel"`;
}

function dayOf(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char((${column} + interval '6 hours')::date, 'YYYY-MM-DD')`;
}

const n = (value: bigint | number | null | undefined) => Number(value ?? 0);

// ---------------------------------------------------------------------------
// sales facts (summary, dashboard)
// ---------------------------------------------------------------------------

export interface RawSalesRow {
  day: string;
  channel: Channel;
  locationId: string;
  orders: number;
  gross: number;
  discount: number;
  shipping: number;
}

export async function salesByDay(scope: ReportScope): Promise<RawSalesRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      day: string;
      channel: Channel;
      locationId: string;
      orders: bigint;
      gross: bigint;
      discount: bigint;
      shipping: bigint;
    }>
  >`
    SELECT ${dayOf(Prisma.sql`o."soldAt"`)} AS day, o."channel", o."locationId",
           count(*) AS orders, sum(o."subtotalPoisha") AS gross,
           sum(o."discountPoisha") AS discount, sum(o."shippingPoisha") AS shipping
      FROM "Order" o
     WHERE o."soldAt" >= ${scope.from} AND o."soldAt" < ${scope.to}
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1, 2, 3`;
  return rows.map((row) => ({
    day: row.day,
    channel: row.channel,
    locationId: row.locationId,
    orders: n(row.orders),
    gross: n(row.gross),
    discount: n(row.discount),
    shipping: n(row.shipping),
  }));
}

export interface RawRefundRow {
  day: string;
  channel: Channel;
  locationId: string;
  goods: number;
  shipping: number;
  atTill: number;
}

/** Completed refunds of orders that counted as a sale, by refund day. */
export async function refundsByDay(scope: ReportScope): Promise<RawRefundRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      day: string;
      channel: Channel;
      locationId: string;
      goods: bigint;
      shipping: bigint;
      atTill: bigint;
    }>
  >`
    SELECT ${dayOf(Prisma.sql`r."processedAt"`)} AS day, o."channel", o."locationId",
           sum(r."amountPoisha" - r."shippingRefundPoisha") AS goods,
           sum(r."shippingRefundPoisha") AS shipping,
           sum(CASE WHEN r."posSessionId" IS NOT NULL THEN r."amountPoisha" ELSE 0 END) AS "atTill"
      FROM "Refund" r
      JOIN "Order" o ON o."id" = r."orderId"
     WHERE r."status" = 'COMPLETED'
       AND r."processedAt" >= ${scope.from} AND r."processedAt" < ${scope.to}
       AND o."soldAt" IS NOT NULL
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1, 2, 3`;
  return rows.map((row) => ({
    day: row.day,
    channel: row.channel,
    locationId: row.locationId,
    goods: n(row.goods),
    shipping: n(row.shipping),
    atTill: n(row.atTill),
  }));
}

export interface RawAmountRow {
  day: string;
  channel: Channel;
  locationId: string;
  count: number;
  amount: number;
  shipping: number;
}

/** Exchange credit used by exchange orders sold in the period. */
export async function exchangeCreditByDay(scope: ReportScope): Promise<RawAmountRow[]> {
  const rows = await db.$queryRaw<
    Array<{ day: string; channel: Channel; locationId: string; count: bigint; amount: bigint }>
  >`
    SELECT ${dayOf(Prisma.sql`o."soldAt"`)} AS day, o."channel", o."locationId",
           count(DISTINCT o."id") AS count, sum(p."amountPoisha") AS amount
      FROM "Payment" p
      JOIN "Order" o ON o."id" = p."orderId"
     WHERE p."provider" = 'EXCHANGE_CREDIT' AND p."status" = 'PAID'
       AND o."soldAt" >= ${scope.from} AND o."soldAt" < ${scope.to}
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1, 2, 3`;
  return rows.map((row) => ({
    day: row.day,
    channel: row.channel,
    locationId: row.locationId,
    count: n(row.count),
    amount: n(row.amount),
    shipping: 0,
  }));
}

/** Sold orders that came back to the warehouse after a failed delivery. */
export async function deliveryReturnsByDay(scope: ReportScope): Promise<RawAmountRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      day: string;
      channel: Channel;
      locationId: string;
      count: bigint;
      amount: bigint;
      shipping: bigint;
    }>
  >`
    SELECT ${dayOf(Prisma.sql`o."returnedToWarehouseAt"`)} AS day, o."channel", o."locationId",
           count(*) AS count, sum(o."subtotalPoisha" - o."discountPoisha") AS amount,
           sum(o."shippingPoisha") AS shipping
      FROM "Order" o
     WHERE o."returnedToWarehouseAt" >= ${scope.from} AND o."returnedToWarehouseAt" < ${scope.to}
       AND o."soldAt" IS NOT NULL
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1, 2, 3`;
  return rows.map((row) => ({
    day: row.day,
    channel: row.channel,
    locationId: row.locationId,
    count: n(row.count),
    amount: n(row.amount),
    shipping: n(row.shipping),
  }));
}

// ---------------------------------------------------------------------------
// line level
// ---------------------------------------------------------------------------

export interface RawSoldLine {
  variantId: string | null;
  sku: string;
  productName: string;
  size: string | null;
  colour: string | null;
  channel: Channel;
  locationId: string;
  costKnown: boolean;
  qty: number;
  gross: number;
  discount: number;
  cost: number;
}

/** Order lines of orders sold in the period, aggregated per variant. */
export async function soldLines(scope: ReportScope): Promise<RawSoldLine[]> {
  const rows = await db.$queryRaw<
    Array<{
      variantId: string | null;
      sku: string;
      productName: string;
      size: string | null;
      colour: string | null;
      channel: Channel;
      locationId: string;
      costKnown: boolean;
      qty: bigint;
      gross: bigint;
      discount: bigint;
      cost: bigint;
    }>
  >`
    SELECT oi."variantId", oi."sku", oi."productNameEn" AS "productName",
           oi."sizeLabelEn" AS size, oi."colourLabelEn" AS colour,
           o."channel", o."locationId", (oi."unitCostPoisha" IS NOT NULL) AS "costKnown",
           sum(oi."quantity") AS qty, sum(oi."lineTotalPoisha") AS gross,
           sum(oi."discountPoisha") AS discount,
           sum(COALESCE(oi."unitCostPoisha", 0)::bigint * oi."quantity") AS cost
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
     WHERE o."soldAt" >= ${scope.from} AND o."soldAt" < ${scope.to}
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`;
  return rows.map((row) => ({
    ...row,
    qty: n(row.qty),
    gross: n(row.gross),
    discount: n(row.discount),
    cost: n(row.cost),
  }));
}

const RETURN_LINE_SELECT = {
  id: true,
  variantId: true,
  sku: true,
  productNameEn: true,
  sizeLabelEn: true,
  colourLabelEn: true,
  quantity: true,
  unitCostPoisha: true,
  lineTotalPoisha: true,
  discountPoisha: true,
} satisfies Prisma.OrderItemSelect;

const ORDER_SCOPE_SELECT = { channel: true, locationId: true } satisfies Prisma.OrderSelect;

function orderWhere(scope: ReportScope): Prisma.OrderWhereInput {
  return {
    soldAt: { not: null },
    ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
    ...(scope.channel === null ? {} : { channel: scope.channel }),
  };
}

/** Completed refunds in the period with the returned items they paid for. */
export async function refundsWithItems(scope: ReportScope) {
  return db.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: { gte: scope.from, lt: scope.to },
      order: orderWhere(scope),
    },
    select: {
      id: true,
      amountPoisha: true,
      shippingRefundPoisha: true,
      order: { select: ORDER_SCOPE_SELECT },
      returnRequest: {
        select: {
          items: {
            where: { creditPoisha: { gt: 0 } },
            select: {
              quantity: true,
              creditPoisha: true,
              restockLocationId: true,
              orderItem: { select: RETURN_LINE_SELECT },
            },
          },
        },
      },
    },
  });
}

/** Exchange orders sold in the period, with the credit and the items given back. */
export async function exchangesWithItems(scope: ReportScope) {
  return db.order.findMany({
    where: {
      ...orderWhere(scope),
      soldAt: { gte: scope.from, lt: scope.to },
      exchangeFor: { isNot: null },
    },
    select: {
      ...ORDER_SCOPE_SELECT,
      payments: {
        where: { provider: "EXCHANGE_CREDIT", status: "PAID" },
        select: { amountPoisha: true },
      },
      exchangeFor: {
        select: {
          items: {
            where: { creditPoisha: { gt: 0 } },
            select: {
              quantity: true,
              creditPoisha: true,
              restockLocationId: true,
              orderItem: { select: RETURN_LINE_SELECT },
            },
          },
        },
      },
    },
  });
}

/** Sold orders returned to the warehouse in the period, with their lines. */
export async function deliveryReturnsWithItems(scope: ReportScope) {
  return db.order.findMany({
    where: { ...orderWhere(scope), returnedToWarehouseAt: { gte: scope.from, lt: scope.to } },
    select: { ...ORDER_SCOPE_SELECT, items: { select: RETURN_LINE_SELECT } },
  });
}

export type ReturnLineRow = Prisma.OrderItemGetPayload<{ select: typeof RETURN_LINE_SELECT }>;

/** Product, category and brand of variants, for grouping line facts. */
export async function variantCatalogue(variantIds: readonly string[]) {
  if (variantIds.length === 0) return [];
  return db.productVariant.findMany({
    where: { id: { in: [...variantIds] } },
    select: {
      id: true,
      product: {
        select: {
          id: true,
          nameEn: true,
          code: true,
          category: { select: { id: true, nameEn: true, parentId: true } },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// detail: sold orders (drill-down and the streamed CSV)
// ---------------------------------------------------------------------------

export async function soldOrdersPage(scope: ReportScope, after: string | null, take: number) {
  return db.order.findMany({
    where: {
      ...orderWhere(scope),
      soldAt: { gte: scope.from, lt: scope.to },
      ...(after === null ? {} : { id: { gt: after } }),
    },
    select: {
      id: true,
      orderNumber: true,
      channel: true,
      soldAt: true,
      status: true,
      subtotalPoisha: true,
      discountPoisha: true,
      shippingPoisha: true,
      totalPoisha: true,
      refundedPoisha: true,
      paymentMethod: true,
      couponCode: true,
      location: { select: { code: true } },
    },
    orderBy: { id: "asc" },
    take,
  });
}

export type SoldOrderRow = Awaited<ReturnType<typeof soldOrdersPage>>[number];

// ---------------------------------------------------------------------------
// stock value and slow stock
// ---------------------------------------------------------------------------

export interface RawStockValueRow {
  locationId: string;
  units: number;
  unitsWithoutCost: number;
  costValue: number;
  retailValue: number;
}

export async function stockValueByLocation(
  locationIds: readonly string[] | undefined,
  categoryIds: readonly string[] | null,
): Promise<RawStockValueRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      locationId: string;
      units: bigint;
      unitsWithoutCost: bigint;
      costValue: bigint;
      retailValue: bigint;
    }>
  >`
    SELECT l."locationId",
           sum(l."onHand") AS units,
           sum(CASE WHEN v."costPoisha" IS NULL THEN l."onHand" ELSE 0 END) AS "unitsWithoutCost",
           sum(COALESCE(v."costPoisha", 0)::bigint * l."onHand") AS "costValue",
           sum(v."pricePoisha"::bigint * l."onHand") AS "retailValue"
      FROM "InventoryLevel" l
      JOIN "ProductVariant" v ON v."id" = l."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     WHERE l."onHand" > 0
       AND ${locationSql(Prisma.sql`l."locationId"`, locationIds)}
       AND ${categoryIds === null ? Prisma.sql`TRUE` : Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds.length === 0 ? [NONE] : [...categoryIds])})`}
     GROUP BY 1`;
  return rows.map((row) => ({
    locationId: row.locationId,
    units: n(row.units),
    unitsWithoutCost: n(row.unitsWithoutCost),
    costValue: n(row.costValue),
    retailValue: n(row.retailValue),
  }));
}

/** Goods dispatched and not yet received, by destination. */
export async function inTransitByDestination(
  locationIds: readonly string[] | undefined,
  categoryIds: readonly string[] | null,
): Promise<RawStockValueRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      locationId: string;
      units: bigint;
      unitsWithoutCost: bigint;
      costValue: bigint;
      retailValue: bigint;
    }>
  >`
    SELECT t."toLocationId" AS "locationId",
           sum(i."quantitySent") AS units,
           sum(CASE WHEN v."costPoisha" IS NULL THEN i."quantitySent" ELSE 0 END) AS "unitsWithoutCost",
           sum(COALESCE(v."costPoisha", 0)::bigint * i."quantitySent") AS "costValue",
           sum(v."pricePoisha"::bigint * i."quantitySent") AS "retailValue"
      FROM "StockTransferItem" i
      JOIN "StockTransfer" t ON t."id" = i."transferId"
      JOIN "ProductVariant" v ON v."id" = i."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     WHERE t."status" = 'DISPATCHED'
       AND (${locationSql(Prisma.sql`t."toLocationId"`, locationIds)}
            OR ${locationSql(Prisma.sql`t."fromLocationId"`, locationIds)})
       AND ${categoryIds === null ? Prisma.sql`TRUE` : Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds.length === 0 ? [NONE] : [...categoryIds])})`}
     GROUP BY 1`;
  return rows.map((row) => ({
    locationId: row.locationId,
    units: n(row.units),
    unitsWithoutCost: n(row.unitsWithoutCost),
    costValue: n(row.costValue),
    retailValue: n(row.retailValue),
  }));
}

export interface RawSlowStockRow {
  variantId: string;
  sku: string;
  productName: string;
  label: string | null;
  locationId: string;
  onHand: number;
  costPoisha: number | null;
  pricePoisha: number;
  lastSaleAt: Date | null;
  stockedSince: Date | null;
}

/** Stock on hand with no sale at that location since `since`. */
export async function slowStock(
  locationIds: readonly string[] | undefined,
  categoryIds: readonly string[] | null,
  since: Date,
  limit: number,
): Promise<RawSlowStockRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      variantId: string;
      sku: string;
      productName: string;
      label: string | null;
      locationId: string;
      onHand: number;
      costPoisha: number | null;
      pricePoisha: number;
      lastSaleAt: Date | null;
      stockedSince: Date | null;
    }>
  >`
    SELECT l."variantId", v."sku", p."nameEn" AS "productName", v."labelEn" AS label,
           l."locationId", l."onHand", v."costPoisha", v."pricePoisha",
           (SELECT max(m."createdAt") FROM "InventoryMovement" m
             WHERE m."variantId" = l."variantId" AND m."locationId" = l."locationId"
               AND m."type" IN ('SALE_ONLINE', 'SALE_STORE')) AS "lastSaleAt",
           (SELECT min(m."createdAt") FROM "InventoryMovement" m
             WHERE m."variantId" = l."variantId" AND m."locationId" = l."locationId"
               AND m."quantity" > 0) AS "stockedSince"
      FROM "InventoryLevel" l
      JOIN "ProductVariant" v ON v."id" = l."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     WHERE l."onHand" > 0
       AND ${locationSql(Prisma.sql`l."locationId"`, locationIds)}
       AND ${categoryIds === null ? Prisma.sql`TRUE` : Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds.length === 0 ? [NONE] : [...categoryIds])})`}
       AND NOT EXISTS (
         SELECT 1 FROM "InventoryMovement" m
          WHERE m."variantId" = l."variantId" AND m."locationId" = l."locationId"
            AND m."type" IN ('SALE_ONLINE', 'SALE_STORE') AND m."createdAt" >= ${since})
     ORDER BY "lastSaleAt" ASC NULLS FIRST, l."onHand" DESC
     LIMIT ${limit}`;
  return rows;
}

// ---------------------------------------------------------------------------
// COD
// ---------------------------------------------------------------------------

/** Delivered cash-on-delivery orders not fully collected yet. */
export async function uncollectedCod(locationIds: readonly string[] | undefined) {
  return db.order.findMany({
    where: {
      channel: "ONLINE",
      paymentMethod: "COD",
      status: "DELIVERED",
      deliveredAt: { not: null },
      ...(locationIds === undefined ? {} : { locationId: { in: [...locationIds] } }),
    },
    select: {
      id: true,
      orderNumber: true,
      locationId: true,
      totalPoisha: true,
      paidPoisha: true,
      deliveredAt: true,
      shipments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { courier: true, courierName: true },
      },
    },
    orderBy: { deliveredAt: "asc" },
  });
}

export async function codSettlementsInRange(
  from: Date,
  to: Date,
  locationIds: readonly string[] | undefined,
) {
  return db.codSettlementItem.findMany({
    where: {
      settlement: { createdAt: { gte: from, lt: to } },
      ...(locationIds === undefined ? {} : { order: { locationId: { in: [...locationIds] } } }),
    },
    select: {
      expectedPoisha: true,
      receivedPoisha: true,
      settlement: {
        select: {
          reference: true,
          courier: true,
          courierName: true,
          receivedOn: true,
          courierChargePoisha: true,
        },
      },
      order: { select: { orderNumber: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// coupons, returns, failed deliveries
// ---------------------------------------------------------------------------

export async function couponUsage(scope: ReportScope) {
  const rows = await db.$queryRaw<
    Array<{ code: string; orders: bigint; discount: bigint; goods: bigint; gross: bigint }>
  >`
    SELECT o."couponCode" AS code, count(*) AS orders,
           sum(o."discountPoisha" - o."manualDiscountPoisha") AS discount,
           sum(o."subtotalPoisha" - o."discountPoisha") AS goods,
           sum(o."subtotalPoisha") AS gross
      FROM "Order" o
     WHERE o."soldAt" >= ${scope.from} AND o."soldAt" < ${scope.to}
       AND o."couponCode" IS NOT NULL
       AND ${locationSql(Prisma.sql`o."locationId"`, scope.locationIds)}
       AND ${channelSql(Prisma.sql`o."channel"`, scope.channel)}
     GROUP BY 1
     ORDER BY discount DESC`;
  return rows.map((row) => ({
    code: row.code,
    orders: n(row.orders),
    discount: n(row.discount),
    goods: n(row.goods),
    gross: n(row.gross),
  }));
}

/** Return requests opened in the period with their items. */
export async function returnRequestsInRange(scope: ReportScope) {
  return db.returnRequest.findMany({
    where: {
      requestedAt: { gte: scope.from, lt: scope.to },
      order: {
        ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
        ...(scope.channel === null ? {} : { channel: scope.channel }),
      },
    },
    select: {
      type: true,
      status: true,
      reasonCode: true,
      items: {
        select: {
          quantity: true,
          creditPoisha: true,
          orderItem: { select: { variantId: true, sku: true, productNameEn: true } },
        },
      },
    },
  });
}

export async function completedRefundsByMethod(scope: ReportScope) {
  const rows = await db.refund.groupBy({
    by: ["method"],
    where: {
      status: "COMPLETED",
      processedAt: { gte: scope.from, lt: scope.to },
      order: {
        ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
        ...(scope.channel === null ? {} : { channel: scope.channel }),
      },
    },
    _sum: { amountPoisha: true },
    _count: { _all: true },
  });
  return rows.map((row) => ({
    method: row.method,
    count: row._count._all,
    amount: row._sum.amountPoisha ?? 0,
  }));
}

export async function cancelledInRange(scope: ReportScope) {
  return db.order.findMany({
    where: {
      cancelledAt: { gte: scope.from, lt: scope.to },
      ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
      ...(scope.channel === null ? {} : { channel: scope.channel }),
    },
    select: {
      cancelReason: true,
      totalPoisha: true,
      shipDistrictName: true,
      zoneName: true,
    },
  });
}

export async function failedDeliveriesInRange(scope: ReportScope) {
  return db.order.findMany({
    where: {
      soldAt: { not: null },
      OR: [
        { deliveryFailedAt: { gte: scope.from, lt: scope.to } },
        { returnedToWarehouseAt: { gte: scope.from, lt: scope.to } },
      ],
      ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
    },
    select: {
      status: true,
      deliveryFailedAt: true,
      deliveryFailedReason: true,
      returnedToWarehouseAt: true,
      shippingPoisha: true,
      shipDistrictName: true,
      zoneName: true,
      shipments: { select: { lostChargePoisha: true, failedReason: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// till
// ---------------------------------------------------------------------------

export async function tillDaysInRange(scope: ReportScope) {
  return db.posSession.findMany({
    where: {
      openedAt: { gte: scope.from, lt: scope.to },
      ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
    },
    select: {
      id: true,
      reference: true,
      locationId: true,
      counterCode: true,
      status: true,
      openedAt: true,
      closedAt: true,
      openingFloatPoisha: true,
      expectedCashPoisha: true,
      countedCashPoisha: true,
      differencePoisha: true,
      differenceReason: true,
      zReport: true,
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function tillPaymentsByMethod(scope: ReportScope) {
  const rows = await db.payment.groupBy({
    by: ["provider"],
    where: {
      posSessionId: { not: null },
      status: "PAID",
      paidAt: { gte: scope.from, lt: scope.to },
      ...(scope.locationIds === undefined
        ? {}
        : { order: { locationId: { in: [...scope.locationIds] } } }),
    },
    _sum: { amountPoisha: true, changePoisha: true },
    _count: { _all: true },
  });
  return rows.map((row) => ({
    method: row.provider,
    count: row._count._all,
    amount: row._sum.amountPoisha ?? 0,
  }));
}

export async function storeSalesByStaff(scope: ReportScope) {
  const rows = await db.order.groupBy({
    by: ["soldByUserId"],
    where: {
      channel: "STORE",
      soldAt: { gte: scope.from, lt: scope.to },
      ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
    },
    _sum: { subtotalPoisha: true, discountPoisha: true, manualDiscountPoisha: true },
    _count: { _all: true },
  });
  return rows.map((row) => ({
    userId: row.soldByUserId,
    bills: row._count._all,
    gross: row._sum.subtotalPoisha ?? 0,
    discount: row._sum.discountPoisha ?? 0,
    manualDiscount: row._sum.manualDiscountPoisha ?? 0,
  }));
}

export async function approvedTillDiscounts(scope: ReportScope) {
  return db.order.findMany({
    where: {
      channel: "STORE",
      soldAt: { gte: scope.from, lt: scope.to },
      discountApprovedByUserId: { not: null },
      ...(scope.locationIds === undefined ? {} : { locationId: { in: [...scope.locationIds] } }),
    },
    select: {
      id: true,
      orderNumber: true,
      soldAt: true,
      subtotalPoisha: true,
      manualDiscountPoisha: true,
      soldByUserId: true,
      discountApprovedByUserId: true,
      locationId: true,
    },
    orderBy: { soldAt: "desc" },
    take: 500,
  });
}

// ---------------------------------------------------------------------------
// inventory movements (adjustments, damage, count corrections)
// ---------------------------------------------------------------------------

export const LOSS_MOVEMENT_TYPES = [
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "COUNT_CORRECTION",
  "TRANSFER_DISCREPANCY",
] as const;

export async function lossMovements(
  from: Date,
  to: Date,
  locationIds: readonly string[] | undefined,
  categoryIds: readonly string[] | null,
) {
  const rows = await db.$queryRaw<
    Array<{
      type: string;
      reasonCode: string | null;
      userId: string | null;
      locationId: string;
      movements: bigint;
      unitsIn: bigint;
      unitsOut: bigint;
      costIn: bigint;
      costOut: bigint;
      unitsWithoutCost: bigint;
    }>
  >`
    SELECT m."type"::text AS type, m."reasonCode", m."userId", m."locationId",
           count(*) AS movements,
           sum(GREATEST(m."quantity", 0)) AS "unitsIn",
           sum(GREATEST(-m."quantity", 0)) AS "unitsOut",
           sum(CASE WHEN m."quantity" > 0 THEN COALESCE(v."costPoisha", 0)::bigint * m."quantity" ELSE 0 END) AS "costIn",
           sum(CASE WHEN m."quantity" < 0 THEN COALESCE(v."costPoisha", 0)::bigint * -m."quantity" ELSE 0 END) AS "costOut",
           sum(CASE WHEN v."costPoisha" IS NULL THEN abs(m."quantity") ELSE 0 END) AS "unitsWithoutCost"
      FROM "InventoryMovement" m
      JOIN "ProductVariant" v ON v."id" = m."variantId"
      JOIN "Product" p ON p."id" = v."productId"
     WHERE m."createdAt" >= ${from} AND m."createdAt" < ${to}
       AND m."type"::text IN (${Prisma.join([...LOSS_MOVEMENT_TYPES])})
       AND ${locationSql(Prisma.sql`m."locationId"`, locationIds)}
       AND ${categoryIds === null ? Prisma.sql`TRUE` : Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds.length === 0 ? [NONE] : [...categoryIds])})`}
     GROUP BY 1, 2, 3, 4
     ORDER BY "unitsOut" DESC`;
  return rows.map((row) => ({
    type: row.type,
    reasonCode: row.reasonCode,
    userId: row.userId,
    locationId: row.locationId,
    movements: n(row.movements),
    unitsIn: n(row.unitsIn),
    unitsOut: n(row.unitsOut),
    costIn: n(row.costIn),
    costOut: n(row.costOut),
    unitsWithoutCost: n(row.unitsWithoutCost),
  }));
}

// ---------------------------------------------------------------------------
// dashboard work queue
// ---------------------------------------------------------------------------

export async function workQueueCounts(input: {
  locationIds: readonly string[] | undefined;
  staleShippedBefore: Date;
  codDeliveredBefore: Date;
}) {
  const scope =
    input.locationIds === undefined ? {} : { locationId: { in: [...input.locationIds] } };
  const online = { channel: "ONLINE" as const, ...scope };
  const [review, unreachable, pending, toPack, staleShipped, codOverdue] = await Promise.all([
    db.order.count({
      where: { ...online, status: "PENDING", NOT: { reviewReasons: { isEmpty: true } } },
    }),
    db.order.count({ where: { ...online, status: "PENDING", unreachableAt: { not: null } } }),
    db.order.count({
      where: {
        ...online,
        status: "PENDING",
        reviewReasons: { isEmpty: true },
        unreachableAt: null,
      },
    }),
    db.order.count({ where: { ...online, status: { in: ["CONFIRMED", "PROCESSING"] } } }),
    db.order.count({
      where: { ...online, status: "SHIPPED", shippedAt: { lt: input.staleShippedBefore } },
    }),
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM "Order" o
       WHERE o."channel" = 'ONLINE' AND o."paymentMethod" = 'COD' AND o."status" = 'DELIVERED'
         AND o."paidPoisha" < o."totalPoisha" AND o."deliveredAt" < ${input.codDeliveredBefore}
         AND ${locationSql(Prisma.sql`o."locationId"`, input.locationIds)}`,
  ]);
  return {
    review,
    unreachable,
    pending,
    toPack,
    staleShipped,
    codOverdue: n(codOverdue[0]?.count),
  };
}

export async function refundsAwaitingApproval(locationIds: readonly string[] | undefined) {
  return db.refund.count({
    where: {
      status: "PENDING",
      requiresApproval: true,
      approvedAt: null,
      ...(locationIds === undefined ? {} : { order: { locationId: { in: [...locationIds] } } }),
    },
  });
}

export async function openReturns(locationIds: readonly string[] | undefined) {
  return db.returnRequest.count({
    where: {
      status: { in: ["REQUESTED", "APPROVED", "RECEIVED", "INSPECTED"] },
      ...(locationIds === undefined ? {} : { order: { locationId: { in: [...locationIds] } } }),
    },
  });
}

export async function transfersInTransit(locationIds: readonly string[] | undefined) {
  return db.stockTransfer.count({
    where: {
      status: "DISPATCHED",
      ...(locationIds === undefined
        ? {}
        : {
            OR: [
              { toLocationId: { in: [...locationIds] } },
              { fromLocationId: { in: [...locationIds] } },
            ],
          }),
    },
  });
}

export async function openTillDays(locationIds: readonly string[] | undefined) {
  return db.posSession.findMany({
    where: {
      status: "OPEN",
      ...(locationIds === undefined ? {} : { locationId: { in: [...locationIds] } }),
    },
    select: {
      id: true,
      reference: true,
      counterCode: true,
      openedAt: true,
      location: { select: { code: true, nameEn: true } },
    },
    orderBy: { openedAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// lookups
// ---------------------------------------------------------------------------

export async function reportLocations(locationIds: readonly string[] | undefined) {
  return db.location.findMany({
    where: {
      deletedAt: null,
      ...(locationIds === undefined ? {} : { id: { in: [...locationIds] } }),
    },
    select: { id: true, code: true, nameEn: true, type: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
}

export async function reportCategories() {
  return db.category.findMany({
    where: { deletedAt: null },
    select: { id: true, nameEn: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
}

export async function userNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(rows.map((row) => [row.id, row.name ?? row.email ?? row.id]));
}
