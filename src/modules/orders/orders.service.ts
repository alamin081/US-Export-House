import "server-only";

import { z } from "zod";

import { PAGE_SIZE } from "@/config/constants";
import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  canAccessLocation,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { maskBdMobile } from "@/modules/checkout/phone";
import { applyStockMovements, parse } from "@/modules/inventory/inventory.service";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";
import { notify } from "@/modules/notifications/notification.service";
import { getOrderSettings, getReportSettings } from "@/modules/settings/settings.service";
import {
  assertAnyPermission,
  assertTransition,
  auditInTx,
  conflict,
  orderNotFound,
  withLockedOrder,
} from "./order-context";
import {
  callNeedsAttention,
  countsTowardUnreachable,
  isUnreachable,
  type CallOutcome,
} from "./order-rules";
import { CANCEL_REASON_LABELS, CANCEL_REASONS } from "./order-labels";
import {
  holdsReservation,
  isAddressCorrectable,
  isEditable,
  ORDER_TABS,
  tabStatuses,
  transitionsFrom,
  type OrderStatus,
} from "./order-state";
import {
  addCustomerNote,
  addOrderNote,
  countDeliveryFailures,
  countOrdersByStatus,
  findCustomerPhoneOfOrder,
  findCustomerStats,
  findFulfilmentLocations,
  findOrderDetail,
  findOrdersForPrint,
  findUserNames,
  listCustomers,
  listOrders,
  type LockedOrder,
} from "./orders.repository";

/**
 * Online orders after checkout: the admin list and order page, confirmation
 * calls, confirming and cancelling, notes and the customer view. Editing,
 * packing, shipping and courier cash live in their own services.
 */

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  tab: z.enum(ORDER_TABS.map((tab) => tab.key) as [string, ...string[]]).catch("new"),
  q: z.string().trim().max(60).optional(),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  zone: z.string().trim().max(40).optional(),
  coupon: z.string().trim().max(40).optional(),
  review: z.literal("1").optional().catch(undefined),
  unreachable: z.literal("1").optional().catch(undefined),
  soldFrom: z.iso.date().optional().catch(undefined),
  soldTo: z.iso.date().optional().catch(undefined),
  stale: z.literal("1").optional().catch(undefined),
  codOverdue: z.literal("1").optional().catch(undefined),
  location: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** Start of a Bangladesh calendar day (UTC+6, no daylight saving). */
function dhakaDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+06:00`);
}

export async function listOrdersForStaff(staff: StaffContext, raw: Record<string, unknown>) {
  assertPermission(staff, "order.read");
  const query = listQuerySchema.parse(raw);
  const scope = locationScope(staff);
  const showPhone = hasPermission(staff, "customer.read");
  const filterLocation =
    query.location !== undefined &&
    query.location !== "" &&
    canAccessLocation(staff, query.location)
      ? query.location
      : null;
  const reportSettings =
    query.stale === "1" || query.codOverdue === "1" ? await getReportSettings() : null;
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [result, counts] = await Promise.all([
    listOrders({
      statuses: tabStatuses(query.tab),
      search: query.q === undefined || query.q === "" ? null : query.q,
      searchPersonal: showPhone,
      from: query.from === undefined ? null : dhakaDayStart(query.from),
      to:
        query.to === undefined
          ? null
          : new Date(dhakaDayStart(query.to).getTime() + 24 * 60 * 60 * 1000),
      zoneCode: query.zone === undefined || query.zone === "" ? null : query.zone,
      couponCode:
        query.coupon === undefined || query.coupon === "" ? null : query.coupon.toUpperCase(),
      reviewOnly: query.review === "1",
      unreachableOnly: query.unreachable === "1",
      soldFrom: query.soldFrom === undefined ? null : dhakaDayStart(query.soldFrom),
      soldTo:
        query.soldTo === undefined
          ? null
          : new Date(dhakaDayStart(query.soldTo).getTime() + 24 * 60 * 60 * 1000),
      shippedBefore:
        query.stale === "1" && reportSettings !== null
          ? daysAgo(reportSettings.staleShipmentDays)
          : null,
      codDeliveredBefore:
        query.codOverdue === "1" && reportSettings !== null
          ? daysAgo(reportSettings.codOverdueDays)
          : null,
      locationId: filterLocation,
      locationIds: scope,
      page: query.page,
      pageSize: PAGE_SIZE.admin,
    }),
    countOrdersByStatus(scope),
  ]);
  return {
    tab: query.tab,
    page: query.page,
    pageSize: PAGE_SIZE.admin,
    total: result.total,
    tabCounts: Object.fromEntries(
      ORDER_TABS.map((tab) => [
        tab.key,
        tab.statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0),
      ]),
    ),
    rows: result.rows.map((row) => ({
      ...row,
      customerPhone: showPhone ? row.customerPhone : maskBdMobile(row.customerPhone),
    })),
    locations: (await findFulfilmentLocations()).filter((location) =>
      canAccessLocation(staff, location.id),
    ),
  };
}

// ---------------------------------------------------------------------------
// order page
// ---------------------------------------------------------------------------

export interface OrderActions {
  call: boolean;
  confirm: boolean;
  edit: boolean;
  changeLocation: boolean;
  correctAddress: boolean;
  cancel: boolean;
  blockPhone: boolean;
  startPacking: boolean;
  unpack: boolean;
  pack: boolean;
  ship: boolean;
  deliver: boolean;
  deliveryFailed: boolean;
  receiveReturn: boolean;
  note: boolean;
  printSlip: boolean;
  printInvoice: boolean;
  startReturn: boolean;
}

function orderActions(staff: StaffContext, status: OrderStatus, packed: boolean): OrderActions {
  const can = (key: Parameters<typeof hasPermission>[1]) => hasPermission(staff, key);
  const next = new Set(transitionsFrom(status));
  return {
    call: can("order.confirm") && (status === "PENDING" || status === "CONFIRMED"),
    confirm: can("order.confirm") && next.has("CONFIRM"),
    edit: can("order.edit") && isEditable(status),
    changeLocation: can("order.edit") && isEditable(status),
    correctAddress: can("order.edit") && isAddressCorrectable(status) && !isEditable(status),
    cancel: can("order.cancel") && next.has("CANCEL"),
    blockPhone: can("customer.block"),
    startPacking: can("order.fulfil") && next.has("START_PACKING"),
    unpack: can("order.fulfil") && next.has("UNPACK"),
    pack: can("order.fulfil") && status === "PROCESSING" && !packed,
    ship: can("order.fulfil") && next.has("SHIP") && (status !== "PROCESSING" || packed),
    deliver: can("order.fulfil") && next.has("DELIVER"),
    deliveryFailed: can("order.fulfil") && next.has("DELIVERY_FAILED"),
    receiveReturn: can("order.fulfil") && next.has("RETURN_TO_WAREHOUSE"),
    note: ["order.confirm", "order.edit", "order.fulfil", "order.cancel"].some((key) =>
      can(key as Parameters<typeof hasPermission>[1]),
    ),
    printSlip: can("invoice.print"),
    printInvoice: can("invoice.print"),
    startReturn: can("return.manage") && status === "DELIVERED",
  };
}

export async function getOrderForStaff(staff: StaffContext, id: string) {
  assertPermission(staff, "order.read");
  const order = await findOrderDetail(id);
  if (order === null) throw orderNotFound();
  assertLocationAccess(staff, order.locationId);
  const showPhone = hasPermission(staff, "customer.read");
  const userIds = [
    ...order.statusHistory.map((row) => row.userId),
    ...order.callLogs.map((row) => row.userId),
    ...order.notes.map((row) => row.userId),
    order.confirmedByUserId,
    order.packedByUserId,
  ].filter((value): value is string => value !== null);
  const [names, failures, settings, locations] = await Promise.all([
    findUserNames(userIds),
    countDeliveryFailures(order.customerPhone),
    getOrderSettings(),
    findFulfilmentLocations(),
  ]);
  const mask = (phone: string | null) =>
    phone === null ? null : showPhone ? phone : maskBdMobile(phone);
  return {
    order: {
      ...order,
      customerPhone: mask(order.customerPhone) ?? "",
      shipPhone: mask(order.shipPhone),
    },
    phoneMasked: !showPhone,
    userNames: Object.fromEntries(names),
    deliveryFailuresForPhone: failures,
    countedCalls: order.callLogs.filter((call) => call.counted).length,
    callSettings: settings,
    couriers: settings.couriers,
    fulfilmentLocations: locations.filter((location) => canAccessLocation(staff, location.id)),
    actions: orderActions(staff, order.status as OrderStatus, order.packedAt !== null),
  };
}

// ---------------------------------------------------------------------------
// stock helper
// ---------------------------------------------------------------------------

/** Gives back every unit an unshipped order still holds at its location. */
export async function releaseOrderStock(
  uow: InventoryUnitOfWork,
  order: LockedOrder,
  userId: string,
  reason: string,
) {
  const lines = order.items.filter((item) => item.variantId !== null);
  if (lines.length === 0) return;
  await applyStockMovements(
    uow,
    lines.map((item) => ({
      variantId: item.variantId!,
      locationId: order.locationId,
      type: "RELEASE" as const,
      quantity: -item.quantity,
      referenceType: "ORDER",
      referenceId: order.id,
      userId,
      reason,
    })),
  );
}

// ---------------------------------------------------------------------------
// confirmation calls
// ---------------------------------------------------------------------------

const CALL_OUTCOMES = [
  "CONFIRMED",
  "NO_ANSWER",
  "SWITCHED_OFF",
  "WRONG_NUMBER",
  "CALL_BACK_LATER",
  "CANCEL_REQUESTED",
] as const satisfies readonly CallOutcome[];

const callSchema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(300).optional().default(""),
  callbackAt: z.iso.datetime({ offset: true }).optional().or(z.literal("")).default(""),
});

export interface CallResult {
  counted: boolean;
  countedCalls: number;
  unreachable: boolean;
  confirmed: boolean;
  needsAttention: boolean;
}

/**
 * Records one call. "Answered and confirmed" also confirms a pending order.
 * Enough counted unanswered calls flag the order unreachable — it is never
 * cancelled automatically.
 */
export async function logCall(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
  now: () => Date = () => new Date(),
): Promise<CallResult> {
  assertPermission(staff, "order.confirm");
  const input = parse(callSchema, raw);
  const settings = await getOrderSettings();
  const result = await withLockedOrder(staff, orderId, {}, async ({ uow, tx, order }) => {
    if (order.channel !== "ONLINE" || !["PENDING", "CONFIRMED"].includes(order.status)) {
      throw conflict("Calls are logged only for pending or confirmed orders.");
    }
    const at = now();
    const last = await tx.lastCountedCall(order.id);
    const counted = countsTowardUnreachable({
      outcome: input.outcome,
      at,
      lastCountedAt: last?.createdAt ?? null,
      settings,
    });
    await tx.addCall({
      orderId: order.id,
      userId: staff.userId,
      outcome: input.outcome,
      note: input.note === "" ? null : input.note,
      callbackAt: input.callbackAt === "" ? null : new Date(input.callbackAt),
      counted,
      createdAt: at,
    });
    const countedCalls = await tx.countCountedCalls(order.id);
    const unreachable = isUnreachable(countedCalls, settings);
    const confirm = input.outcome === "CONFIRMED" && order.status === "PENDING";
    if (confirm) assertTransition(staff, order, "CONFIRM");
    if (confirm || (unreachable && order.unreachableAt === null) || input.outcome === "CONFIRMED") {
      await tx.updateOrder(order.id, {
        ...(unreachable && order.unreachableAt === null ? { unreachableAt: at } : {}),
        // A customer who answers is reachable again.
        ...(input.outcome === "CONFIRMED" ? { unreachableAt: null } : {}),
        ...(confirm
          ? { status: "CONFIRMED", confirmedAt: at, confirmedByUserId: staff.userId }
          : {}),
      });
    }
    if (confirm) {
      await tx.addHistory({
        orderId: order.id,
        status: "CONFIRMED",
        noteEn: "Confirmed by phone.",
        userId: staff.userId,
      });
    }
    await auditInTx(uow, staff, meta, {
      action: confirm ? AUDIT_ACTIONS.orderConfirmed : AUDIT_ACTIONS.orderCallLogged,
      orderId: order.id,
      locationId: order.locationId,
      after: { outcome: input.outcome, counted, countedCalls, unreachable },
    });
    return {
      counted,
      countedCalls,
      unreachable,
      confirmed: confirm,
      needsAttention: callNeedsAttention(input.outcome),
      orderNumber: order.orderNumber,
      totalPoisha: order.totalPoisha,
    };
  });
  if (result.confirmed) {
    await notify({
      type: "order.confirmed",
      orderNumber: result.orderNumber,
      totalPoisha: result.totalPoisha,
    });
  }
  return {
    counted: result.counted,
    countedCalls: result.countedCalls,
    unreachable: result.unreachable,
    confirmed: result.confirmed,
    needsAttention: result.needsAttention,
  };
}

// ---------------------------------------------------------------------------
// confirm / cancel
// ---------------------------------------------------------------------------

const versionSchema = z.object({ version: z.coerce.number().int().min(0) });

export async function confirmOrder(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const { version } = parse(versionSchema, raw);
  const confirmed = await withLockedOrder(
    staff,
    orderId,
    { version },
    async ({ uow, tx, order }) => {
      assertTransition(staff, order, "CONFIRM");
      const at = new Date();
      await tx.updateOrder(order.id, {
        status: "CONFIRMED",
        confirmedAt: at,
        confirmedByUserId: staff.userId,
      });
      await tx.addHistory({ orderId: order.id, status: "CONFIRMED", userId: staff.userId });
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderConfirmed,
        orderId: order.id,
        locationId: order.locationId,
        before: { status: order.status },
        after: { status: "CONFIRMED" },
      });
      return { orderNumber: order.orderNumber, totalPoisha: order.totalPoisha };
    },
  );
  await notify({ type: "order.confirmed", ...confirmed });
  return confirmed;
}

const cancelSchema = z
  .object({
    version: z.coerce.number().int().min(0),
    reason: z.enum(CANCEL_REASONS, { error: "Choose a reason." }),
    note: z.string().trim().max(300).optional().default(""),
    blockPhone: z.boolean().optional().default(false),
  })
  .refine((value) => value.reason !== "OTHER" || value.note.length >= 3, {
    message: "Write a short note for “Other”.",
    path: ["note"],
  })
  .refine((value) => !value.blockPhone || value.reason === "FAKE_ORDER", {
    message: "Only a fake order can block the phone from here.",
    path: ["blockPhone"],
  });

/**
 * Cancels an order that has not shipped: every reserved unit goes back, the
 * coupon use is returned (owner decision 2026-11-15) and, for a fake order,
 * the phone can be blocked in the same step.
 */
export async function cancelOrder(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const input = parse(cancelSchema, raw);
  if (input.blockPhone) assertPermission(staff, "customer.block");
  const cancelled = await withLockedOrder(
    staff,
    orderId,
    { version: input.version },
    async ({ uow, tx, order }) => {
      assertTransition(staff, order, "CANCEL");
      // Lock order: order (held) -> coupon -> stock rows.
      if (order.couponId !== null && order.redemption !== null) {
        await tx.lockCoupon(order.couponId);
        await tx.returnCouponUse(order.couponId);
      }
      if (holdsReservation(order.status as OrderStatus)) {
        await releaseOrderStock(uow, order, staff.userId, `Order ${order.orderNumber} cancelled`);
      }
      const at = new Date();
      await tx.updateOrder(order.id, {
        status: "CANCELLED",
        cancelledAt: at,
        cancelReason: input.reason,
        cancelNote: input.note === "" ? null : input.note,
      });
      await tx.addHistory({
        orderId: order.id,
        status: "CANCELLED",
        noteEn: `${CANCEL_REASON_LABELS[input.reason]}${input.note === "" ? "" : `: ${input.note}`}`,
        userId: staff.userId,
      });
      if (input.blockPhone) {
        await tx.blockPhone(order.customerPhone, `Fake order ${order.orderNumber}`, staff.userId);
        await uow.audit({
          userId: staff.userId,
          action: AUDIT_ACTIONS.phoneBlocked,
          entityType: "BlockedPhone",
          entityId: null,
          before: null,
          after: { phone: maskBdMobile(order.customerPhone), order: order.orderNumber },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderCancelled,
        orderId: order.id,
        locationId: order.locationId,
        before: { status: order.status },
        after: { status: "CANCELLED", reason: input.reason, blockedPhone: input.blockPhone },
      });
      return { orderNumber: order.orderNumber };
    },
  );
  await notify({
    type: "order.cancelled",
    orderNumber: cancelled.orderNumber,
    reason: input.reason,
  });
  return cancelled;
}

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

const noteSchema = z.object({ body: z.string().trim().min(2, "Write a note.").max(1000) });

export async function addOrderNoteForStaff(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertAnyPermission(staff, ["order.confirm", "order.edit", "order.fulfil", "order.cancel"]);
  const input = parse(noteSchema, raw);
  const order = await findCustomerPhoneOfOrder(orderId);
  if (order === null) throw orderNotFound();
  assertLocationAccess(staff, order.locationId);
  const saved = await addOrderNote(orderId, input.body, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.orderNoteAdded,
    entityType: "order",
    entityId: orderId,
    after: { noteId: saved.id },
    meta,
  });
}

// ---------------------------------------------------------------------------
// customer view (guests: identified by phone, reached through one of their orders)
// ---------------------------------------------------------------------------

export async function getCustomerView(staff: StaffContext, orderId: string) {
  assertPermission(staff, "order.read");
  const anchor = await findCustomerPhoneOfOrder(orderId);
  if (anchor === null) throw new AppError("NOT_FOUND", "Customer not found.");
  assertLocationAccess(staff, anchor.locationId);
  const stats = await findCustomerStats(anchor.customerPhone);
  const count = (statuses: readonly string[]) =>
    stats.byStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
  const showPhone = hasPermission(staff, "customer.read");
  return {
    name: anchor.customerName,
    phone: showPhone ? anchor.customerPhone : maskBdMobile(anchor.customerPhone),
    phoneMasked: !showPhone,
    totals: {
      orders: stats.byStatus.reduce((sum, row) => sum + row._count._all, 0),
      delivered: count(["DELIVERED"]),
      cancelled: count(["CANCELLED"]),
      deliveryFailed: count(["DELIVERY_FAILED", "RETURNED_TO_WAREHOUSE"]),
      spentPoisha: (stats.spent._sum.totalPoisha ?? 0) - (stats.spent._sum.refundedPoisha ?? 0),
    },
    blocked:
      stats.blocked !== null && stats.blocked.unblockedAt === null
        ? { reason: stats.blocked.reason, since: stats.blocked.createdAt }
        : null,
    // Notes are staff-only; an order list is limited to the staff member's locations.
    notes: showPhone ? stats.notes : [],
    canAddNote: showPhone,
    orders: stats.orders.filter((order) => canAccessLocation(staff, order.locationId)),
  };
}

export async function addCustomerNoteForStaff(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "customer.read");
  const input = parse(noteSchema, raw);
  const anchor = await findCustomerPhoneOfOrder(orderId);
  if (anchor === null) throw new AppError("NOT_FOUND", "Customer not found.");
  assertLocationAccess(staff, anchor.locationId);
  const saved = await addCustomerNote(anchor.customerPhone, input.body, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.customerNoteAdded,
    entityType: "customer",
    entityId: saved.id,
    after: { phone: maskBdMobile(anchor.customerPhone) },
    meta,
  });
}

const customerListSchema = z.object({
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export async function listCustomersForStaff(staff: StaffContext, raw: Record<string, unknown>) {
  assertPermission(staff, "order.read");
  const query = customerListSchema.parse(raw);
  const showPhone = hasPermission(staff, "customer.read");
  const result = await listCustomers({
    search: query.q === undefined || query.q === "" ? null : query.q,
    page: query.page,
    pageSize: PAGE_SIZE.admin,
    locationIds: locationScope(staff),
  });
  return {
    page: query.page,
    pageSize: PAGE_SIZE.admin,
    total: result.total,
    rows: result.rows.map((row) => ({
      ...row,
      phone: showPhone ? row.phone : maskBdMobile(row.phone),
    })),
  };
}

// ---------------------------------------------------------------------------
// printing (packing slips; they do not depend on the invoice)
// ---------------------------------------------------------------------------

const printIdsSchema = z
  .string()
  .max(5000)
  .transform((value) => [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(40)).min(1).max(100));

export async function getOrdersForPrint(staff: StaffContext, rawIds: string) {
  assertPermission(staff, "invoice.print");
  const parsed = printIdsSchema.safeParse(rawIds);
  if (!parsed.success) throw new AppError("NOT_FOUND", "No orders to print.");
  const [orders, settings] = await Promise.all([
    findOrdersForPrint(parsed.data),
    getOrderSettings(),
  ]);
  for (const order of orders) assertLocationAccess(staff, order.locationId);
  if (orders.length === 0) throw new AppError("NOT_FOUND", "No orders to print.");
  return { orders, paperSize: settings.packingSlipSize };
}
