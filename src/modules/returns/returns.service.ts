import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "@/config/env";
import { PAGE_SIZE } from "@/config/constants";
import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { findCartVariants } from "@/modules/cart/cart.repository";
import { formatOrderNumber } from "@/modules/checkout/checkout-rules";
import { maskBdMobile, normalizeBdMobile } from "@/modules/checkout/phone";
import { applyStockMovements, getAvailability, parse } from "@/modules/inventory/inventory.service";
import {
  runInventoryTransaction,
  type InventoryUnitOfWork,
} from "@/modules/inventory/inventory.repository";
import { storeReturnPhoto } from "@/modules/media/media.service";
import { notify } from "@/modules/notifications/notification.service";
import { conflict, invalid } from "@/modules/orders/order-context";
import { OrderTx, type LockedOrder } from "@/modules/orders/orders.repository";
import { getReturnsSettings } from "@/modules/settings/settings.service";
import { resolveDeliveryArea } from "@/modules/shipping/shipping.service";
import {
  canStep,
  isWithinWindow,
  planExchange,
  RETURN_REASON_LABELS,
  RETURN_REASONS,
  returnableQuantity,
  stepTarget,
  unitsCredit,
  windowEndsAt,
  type ReturnReason,
  type ReturnStatus,
  type ReturnStep,
} from "./return-rules";
import {
  findExchangeCreditPayment,
  findOrderForReturn,
  findProductVariants,
  findReturnDetail,
  findReturnPolicyPage,
  listReturns,
  reserveThrottleAttempt,
  ReturnTx,
  setReturnPolicyPublished,
  type LockedReturn,
} from "./returns.repository";

/**
 * Returns and exchanges: requests from the customer (tracking page) or from
 * staff, approval (an exchange gets its replacement order at once), receipt,
 * inspection per item (back into stock or written off) and closing. Money is
 * recorded by refund.service.ts.
 */

export const RETURN_PREFIX = "RET";
export { RETURN_REASON_LABELS };

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

interface ReturnWork {
  uow: InventoryUnitOfWork;
  orderTx: OrderTx;
  tx: ReturnTx;
  order: LockedOrder;
  request: LockedReturn;
}

/** Locks the original order, then the request (the global lock order). */
async function withLockedReturn<T>(
  staff: StaffContext,
  returnId: string,
  work: (context: ReturnWork) => Promise<T>,
): Promise<T> {
  return runInventoryTransaction(async (uow) => {
    const tx = new ReturnTx(uow);
    const orderTx = new OrderTx(uow);
    const orderId = await tx.orderIdOfReturn(returnId);
    if (orderId === null) throw new AppError("NOT_FOUND", "Return not found.");
    const order = await orderTx.lockOrder(orderId);
    if (order === null) throw new AppError("NOT_FOUND", "Order not found.");
    assertLocationAccess(staff, order.locationId);
    const request = await tx.lockReturn(returnId);
    if (request === null) throw new AppError("NOT_FOUND", "Return not found.");
    return work({ uow, orderTx, tx, order, request });
  });
}

function assertStep(request: { status: string }, step: ReturnStep): ReturnStatus {
  if (!canStep(request.status as ReturnStatus, step)) {
    throw conflict(
      `This return is ${request.status.toLowerCase()}; that step is not possible now.`,
    );
  }
  return stepTarget(step);
}

async function auditReturn(
  uow: InventoryUnitOfWork,
  actorUserId: string | null,
  meta: RequestMeta,
  entry: {
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
    returnId: string;
    before?: unknown;
    after?: unknown;
    locationId?: string | null;
  },
) {
  await uow.audit({
    userId: actorUserId,
    action: entry.action,
    entityType: "return_request",
    entityId: entry.returnId,
    locationId: entry.locationId ?? null,
    before: entry.before,
    after: entry.after,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// ---------------------------------------------------------------------------
// creating a request (customer or staff)
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  orderItemId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(1).max(100),
  exchangeVariantId: z.string().max(40).optional().or(z.literal("")).default(""),
});

const requestSchema = z.object({
  type: z.enum(["RETURN", "EXCHANGE"]),
  reasonCode: z.enum(RETURN_REASONS as [ReturnReason, ...ReturnReason[]], {
    error: "Choose a reason.",
  }),
  reason: z.string().trim().max(500).optional().default(""),
  items: z.array(itemSchema).min(1, "Choose at least one item.").max(50),
});

type RequestInput = z.infer<typeof requestSchema>;

/** Checks the lines against the order and earlier requests; refuses anything off. */
async function validateRequestLines(
  tx: ReturnTx,
  order: LockedOrder,
  input: RequestInput,
): Promise<void> {
  const requested = await tx.requestedUnits(order.id);
  const seen = new Set<string>();
  const exchangeIds = input.items
    .map((item) => item.exchangeVariantId)
    .filter((id): id is string => id !== "");
  const variants = await findCartVariants(exchangeIds);
  const live = new Map(
    variants
      .filter(
        (variant) =>
          variant.isActive &&
          variant.deletedAt === null &&
          variant.product.status === "PUBLISHED" &&
          variant.product.deletedAt === null,
      )
      .map((variant) => [variant.id, variant]),
  );
  for (const line of input.items) {
    if (seen.has(line.orderItemId)) throw invalid("An item is listed twice.", "items");
    seen.add(line.orderItemId);
    const item = order.items.find((row) => row.id === line.orderItemId);
    if (item === undefined) throw invalid("That item is not on this order.", "items");
    const open = returnableQuantity(item.quantity, requested.get(item.id) ?? 0);
    if (line.quantity > open) {
      throw invalid(`Only ${open} of ${item.sku} can still be returned.`, "items");
    }
    if (input.type === "EXCHANGE") {
      if (line.exchangeVariantId === "")
        throw invalid(`Choose what replaces ${item.sku}.`, "items");
      if (!live.has(line.exchangeVariantId))
        throw invalid("That replacement is not for sale.", "items");
    }
  }
}

async function createRequestInTx(input: {
  uow: InventoryUnitOfWork;
  tx: ReturnTx;
  order: LockedOrder;
  data: RequestInput;
  source: "CUSTOMER" | "STAFF";
  userId: string | null;
  outsideWindowNote: string | null;
  photos: ReadonlyArray<{ provider: string; key: string; url: string }>;
  meta: RequestMeta;
}) {
  await validateRequestLines(input.tx, input.order, input.data);
  const reference = formatOrderNumber(RETURN_PREFIX, new Date(), await input.tx.nextReference());
  const created = await input.tx.createRequest({
    reference,
    orderId: input.order.id,
    status: "REQUESTED",
    type: input.data.type,
    reasonCode: input.data.reasonCode,
    reason: input.data.reason === "" ? null : input.data.reason,
    source: input.source,
    createdByUserId: input.userId,
    outsideWindowNote: input.outsideWindowNote,
    items: {
      create: input.data.items.map((line) => ({
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        exchangeVariantId:
          input.data.type === "EXCHANGE" && line.exchangeVariantId !== ""
            ? line.exchangeVariantId
            : null,
      })),
    },
  });
  await input.tx.addPhotos(created.id, input.photos);
  await auditReturn(input.uow, input.userId, input.meta, {
    action: AUDIT_ACTIONS.returnRequested,
    returnId: created.id,
    locationId: input.order.locationId,
    after: {
      reference,
      order: input.order.orderNumber,
      type: input.data.type,
      reason: input.data.reasonCode,
      source: input.source,
      units: input.data.items.reduce((sum, line) => sum + line.quantity, 0),
      photos: input.photos.length,
    },
  });
  return created;
}

const staffRequestSchema = requestSchema.extend({
  orderId: z.string().min(1).max(40),
  outsideWindowNote: z.string().trim().max(300).optional().default(""),
});

/** Staff open a request for a customer who phoned or came to the shop. */
export async function createStaffReturn(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "return.manage");
  const input = parse(staffRequestSchema, raw);
  const settings = await getReturnsSettings();
  const created = await runInventoryTransaction(async (uow) => {
    const orderTx = new OrderTx(uow);
    const tx = new ReturnTx(uow);
    const order = await orderTx.lockOrder(input.orderId);
    if (order === null) throw new AppError("NOT_FOUND", "Order not found.");
    assertLocationAccess(staff, order.locationId);
    if (order.status !== "DELIVERED") throw conflict("Only delivered orders can be returned.");
    const inside = isWithinWindow(order.deliveredAt, new Date(), settings.windowDays);
    if (!inside && input.outsideWindowNote.length < 3) {
      throw invalid(
        `The ${settings.windowDays}-day return window has passed. Write why it is accepted anyway.`,
        "outsideWindowNote",
      );
    }
    const result = await createRequestInTx({
      uow,
      tx,
      order,
      data: input,
      source: "STAFF",
      userId: staff.userId,
      outsideWindowNote: inside ? null : input.outsideWindowNote,
      photos: [],
      meta,
    });
    return { ...result, orderNumber: order.orderNumber };
  });
  await notify({
    type: "return.requested",
    orderNumber: created.orderNumber,
    reference: created.reference,
  });
  return created;
}

// --- customer side (tracking page) ---------------------------------------------

const TOKEN_TTL_MS = 30 * 60 * 1000;

function tokenSignature(payload: string): string {
  return createHmac("sha256", `return-request:${env.AUTH_SECRET}`)
    .update(payload)
    .digest("base64url");
}

/** Short-lived proof that this browser just looked the order up with its phone. */
export function issueReturnToken(orderId: string, now = Date.now()): string {
  const payload = `${orderId}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${tokenSignature(payload)}`;
}

export function readReturnToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [orderId, expires, signature] = parts as [string, string, string];
  const expected = Buffer.from(tokenSignature(`${orderId}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!/^\d+$/.test(expires) || Number(expires) < now) return null;
  return orderId;
}

export interface CustomerReturnOptions {
  token: string;
  windowEndsAt: string;
  reasons: readonly ReturnReason[];
  maxPhotos: number;
  items: Array<{
    orderItemId: string;
    nameEn: string;
    nameBn: string | null;
    sizeEn: string | null;
    colourEn: string | null;
    returnable: number;
    exchangeOptions: Array<{ variantId: string; labelEn: string; labelBn: string | null }>;
  }>;
}

/**
 * What the tracking page may offer: only delivered online orders inside the
 * window, with the units not already requested, and for an exchange the
 * other sizes/colours of the same product that are in stock online.
 */
export async function getCustomerReturnOptions(
  orderId: string,
): Promise<CustomerReturnOptions | null> {
  const [order, settings] = await Promise.all([findOrderForReturn(orderId), getReturnsSettings()]);
  if (order === null || order.channel !== "ONLINE" || order.status !== "DELIVERED") return null;
  if (
    order.deliveredAt === null ||
    !isWithinWindow(order.deliveredAt, new Date(), settings.windowDays)
  ) {
    return null;
  }
  const requested = new Map<string, number>();
  for (const request of order.returnRequests) {
    for (const item of request.items) {
      requested.set(item.orderItemId, (requested.get(item.orderItemId) ?? 0) + item.quantity);
    }
  }
  const productIds = [
    ...new Set(
      order.items
        .map((item) => item.variant?.productId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
  const variants = await findProductVariants(productIds);
  const available = await getAvailability(
    { online: true },
    variants.map((variant) => variant.id),
  );
  const items = order.items
    .map((item) => ({
      orderItemId: item.id,
      nameEn: item.productNameEn,
      nameBn: item.productNameBn,
      sizeEn: item.sizeLabelEn,
      colourEn: item.colourLabelEn,
      returnable: returnableQuantity(item.quantity, requested.get(item.id) ?? 0),
      exchangeOptions: variants
        .filter(
          (variant) =>
            variant.productId === item.variant?.productId &&
            variant.id !== item.variantId &&
            (available.get(variant.id) ?? 0) > 0,
        )
        .map((variant) => ({
          variantId: variant.id,
          labelEn: variant.labelEn ?? variant.sku,
          labelBn: variant.labelBn,
        })),
    }))
    .filter((item) => item.returnable > 0);
  if (items.length === 0) return null;
  return {
    token: issueReturnToken(order.id),
    windowEndsAt: windowEndsAt(order.deliveredAt, settings.windowDays).toISOString(),
    reasons: RETURN_REASONS,
    maxPhotos: settings.maxPhotos,
    items,
  };
}

export type CustomerReturnResult =
  | { ok: true; reference: string }
  | { ok: false; error: "EXPIRED" | "RATE_LIMITED" | "INVALID" | "NOT_ALLOWED"; message?: string };

const customerSchema = requestSchema.extend({
  token: z.string().max(200),
  phone: z.string().max(30),
});

/**
 * A customer's return or exchange request from the tracking page. The token
 * proves the order was just looked up; the phone is checked again; tries are
 * limited per IP; photos are checked and stored before the request is saved.
 */
export async function createCustomerReturn(
  raw: unknown,
  photos: ReadonlyArray<{ declaredMime: string; bytes: Uint8Array }>,
  meta: RequestMeta,
  ipHash: string | null,
): Promise<CustomerReturnResult> {
  const settings = await getReturnsSettings();
  if (
    (await reserveThrottleAttempt(`return:${ipHash ?? "no-ip"}`, 15 * 60)) >
    settings.requestsPer15Min
  ) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "INVALID", message: parsed.error.issues[0]?.message };
  const orderId = readReturnToken(parsed.data.token);
  if (orderId === null) return { ok: false, error: "EXPIRED" };
  const phone = normalizeBdMobile(parsed.data.phone);
  if (!phone.ok) return { ok: false, error: "EXPIRED" };
  if (photos.length > settings.maxPhotos) {
    return { ok: false, error: "INVALID", message: `At most ${settings.maxPhotos} photos.` };
  }
  let stored: Array<{ provider: string; key: string; url: string }> = [];
  try {
    stored = await Promise.all(photos.map((photo) => storeReturnPhoto(photo, meta)));
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: "INVALID", message: error.message };
    throw error;
  }
  try {
    const created = await runInventoryTransaction(async (uow) => {
      const orderTx = new OrderTx(uow);
      const tx = new ReturnTx(uow);
      const order = await orderTx.lockOrder(orderId);
      if (
        order === null ||
        order.customerPhone !== phone.phone ||
        order.channel !== "ONLINE" ||
        order.status !== "DELIVERED" ||
        !isWithinWindow(order.deliveredAt, new Date(), settings.windowDays)
      ) {
        throw new AppError("FORBIDDEN", "Not allowed.");
      }
      const result = await createRequestInTx({
        uow,
        tx,
        order,
        data: parsed.data,
        source: "CUSTOMER",
        userId: null,
        outsideWindowNote: null,
        photos: stored,
        meta,
      });
      return { ...result, orderNumber: order.orderNumber };
    });
    await notify({
      type: "return.requested",
      orderNumber: created.orderNumber,
      reference: created.reference,
    });
    return { ok: true, reference: created.reference };
  } catch (error) {
    if (error instanceof AppError) {
      return error.code === "FORBIDDEN"
        ? { ok: false, error: "NOT_ALLOWED" }
        : { ok: false, error: "INVALID", message: error.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// approve (exchange: the replacement order), reject, receive
// ---------------------------------------------------------------------------

/**
 * Approving values every unit (cumulative credit) and, for an exchange,
 * creates the linked replacement order at once: CONFIRMED, stock reserved,
 * the credit paid by EXCHANGE_CREDIT and any difference due on delivery.
 */
export async function approveReturn(staff: StaffContext, returnId: string, meta: RequestMeta) {
  assertPermission(staff, "return.manage");
  const settings = await getReturnsSettings();
  const result = await withLockedReturn(staff, returnId, async ({ uow, tx, order, request }) => {
    assertStep(request, "APPROVE");
    const credited = await tx.creditedUnits(order.id, request.id);
    const credits = new Map<string, number>();
    for (const item of request.items) {
      const line = item.orderItem;
      const before = credited.get(line.id) ?? 0;
      const credit = unitsCredit(line, before, item.quantity);
      credited.set(line.id, before + item.quantity);
      credits.set(item.id, credit);
      await tx.updateItem(item.id, { creditPoisha: credit });
    }
    let exchange: { id: string; orderNumber: string; toPayPoisha: number } | null = null;
    if (request.type === "EXCHANGE") {
      exchange = await createExchangeOrder({
        uow,
        tx,
        staff,
        order,
        request,
        credits,
        settings,
        meta,
      });
    }
    const at = new Date();
    await tx.updateRequest(request.id, {
      status: "APPROVED",
      approvedAt: at,
      ...(exchange === null ? {} : { exchangeOrderId: exchange.id }),
    });
    await auditReturn(uow, staff.userId, meta, {
      action: AUDIT_ACTIONS.returnApproved,
      returnId: request.id,
      locationId: order.locationId,
      before: { status: request.status },
      after: {
        status: "APPROVED",
        creditPoisha: [...credits.values()].reduce((sum, value) => sum + value, 0),
        exchangeOrder: exchange?.orderNumber ?? null,
      },
    });
    return { reference: request.reference, orderNumber: order.orderNumber, exchange };
  });
  await notify({
    type: "return.approved",
    orderNumber: result.orderNumber,
    reference: result.reference,
  });
  return result;
}

async function createExchangeOrder(input: {
  uow: InventoryUnitOfWork;
  tx: ReturnTx;
  staff: StaffContext;
  order: LockedOrder;
  request: LockedReturn;
  credits: ReadonlyMap<string, number>;
  settings: Awaited<ReturnType<typeof getReturnsSettings>>;
  meta: RequestMeta;
}) {
  const { uow, tx, staff, order, request } = input;
  const variantIds = request.items
    .map((item) => item.exchangeVariantId)
    .filter((id): id is string => id !== null);
  const originalVariantIds = request.items
    .map((item) => item.orderItem.variantId)
    .filter((id): id is string => id !== null);
  const variants = new Map(
    (await findCartVariants([...new Set([...variantIds, ...originalVariantIds])])).map(
      (variant) => [variant.id, variant],
    ),
  );
  const zoneRate =
    order.channel === "ONLINE" &&
    order.shipDivisionId !== null &&
    order.shipDistrictId !== null &&
    order.shipUpazilaId !== null
      ? ((
          await resolveDeliveryArea({
            divisionId: order.shipDivisionId,
            districtId: order.shipDistrictId,
            upazilaId: order.shipUpazilaId,
          })
        )?.zone.ratePoisha ?? order.shippingPoisha)
      : 0;
  const plan = planExchange({
    reason: request.reasonCode,
    zoneRatePoisha: zoneRate,
    exchangeShippingPaidBy: input.settings.exchangeShippingPaidBy,
    lines: request.items.map((item) => {
      const replacement =
        item.exchangeVariantId === null ? undefined : variants.get(item.exchangeVariantId);
      const original =
        item.orderItem.variantId === null ? undefined : variants.get(item.orderItem.variantId);
      if (replacement === undefined) throw invalid("A replacement item is missing.");
      return {
        quantity: item.quantity,
        creditPoisha: input.credits.get(item.id) ?? 0,
        originalProductId: original?.product.id ?? "",
        originalUnitPricePoisha: item.orderItem.unitPricePoisha,
        replacement: {
          variantId: replacement.id,
          productId: replacement.product.id,
          currentPricePoisha: replacement.pricePoisha,
        },
      };
    }),
  });
  const locationId =
    order.channel === "ONLINE"
      ? ((await tx.defaultOnlineLocationId()) ?? order.locationId)
      : order.locationId;
  const now = new Date();
  const orderNumber = formatOrderNumber("UEH", now, await tx.nextOrderSequence());
  const option = (
    variant: typeof variants extends Map<string, infer V> ? V : never,
    type: "SIZE" | "COLOUR",
  ) =>
    variant.optionValues.find((link) => link.optionValue.option.type === type)?.optionValue ?? null;
  const created = await tx.createOrder({
    orderNumber,
    channel: order.channel,
    locationId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    status: "CONFIRMED",
    confirmedAt: now,
    confirmedByUserId: staff.userId,
    paymentStatus: plan.toPayPoisha === 0 ? "PAID" : "UNPAID",
    paymentMethod: order.channel === "ONLINE" ? "COD" : "CASH",
    subtotalPoisha: plan.subtotalPoisha,
    discountPoisha: plan.discountPoisha,
    shippingPoisha: plan.shippingPoisha,
    totalPoisha: plan.totalPoisha,
    paidPoisha: plan.creditUsedPoisha,
    zoneId: order.zoneId,
    zoneCode: order.zoneCode,
    zoneName: order.zoneName,
    shipName: order.shipName,
    shipPhone: order.shipPhone,
    shipLine1: order.shipLine1,
    shipArea: order.shipArea,
    shipCity: order.shipCity,
    shipLandmark: order.shipLandmark,
    shipDivisionId: order.shipDivisionId,
    shipDivisionName: order.shipDivisionName,
    shipDistrictId: order.shipDistrictId,
    shipDistrictName: order.shipDistrictName,
    shipUpazilaId: order.shipUpazilaId,
    shipUpazilaName: order.shipUpazilaName,
    deliveryNote: order.deliveryNote,
    exchangeOfOrderId: order.id,
    items: {
      create: plan.lines.map((line) => {
        const variant = variants.get(line.variantId)!;
        const size = option(variant, "SIZE");
        const colour = option(variant, "COLOUR");
        return {
          variantId: variant.id,
          productNameEn: variant.product.nameEn,
          productNameBn: variant.product.nameBn,
          variantLabel: variant.labelEn,
          sku: variant.sku,
          imageUrl: variant.product.images[0]?.url ?? null,
          unitPricePoisha: line.unitPricePoisha,
          quantity: line.quantity,
          lineTotalPoisha: line.unitPricePoisha * line.quantity,
          discountPoisha: line.discountPoisha,
          sizeLabelEn: size?.valueEn ?? null,
          sizeLabelBn: size?.valueBn ?? null,
          colourLabelEn: colour?.valueEn ?? null,
          colourLabelBn: colour?.valueBn ?? null,
        };
      }),
    },
    statusHistory: {
      create: {
        status: "CONFIRMED",
        noteEn: `Exchange for ${order.orderNumber} (${request.reference}).`,
        userId: staff.userId,
      },
    },
    payments: {
      create: [
        ...(plan.creditUsedPoisha > 0
          ? [
              {
                provider: "EXCHANGE_CREDIT" as const,
                mode: "LIVE" as const,
                status: "PAID" as const,
                amountPoisha: plan.creditUsedPoisha,
                providerReference: request.reference,
                paidAt: now,
              },
            ]
          : []),
        ...(plan.toPayPoisha > 0 && order.channel === "ONLINE"
          ? [
              {
                provider: "COD" as const,
                mode: "LIVE" as const,
                status: "UNPAID" as const,
                amountPoisha: plan.toPayPoisha,
              },
            ]
          : []),
      ],
    },
  });
  await applyStockMovements(
    uow,
    plan.lines.map((line) => ({
      variantId: line.variantId,
      locationId,
      type: "RESERVE" as const,
      quantity: line.quantity,
      referenceType: "ORDER",
      referenceId: created.id,
      userId: staff.userId,
      reason: `Exchange order ${orderNumber} (${request.reference})`,
    })),
  );
  await uow.audit({
    userId: staff.userId,
    action: AUDIT_ACTIONS.exchangeOrderCreated,
    entityType: "order",
    entityId: created.id,
    locationId,
    after: {
      orderNumber,
      exchangeOf: order.orderNumber,
      reference: request.reference,
      totalPoisha: plan.totalPoisha,
      creditUsedPoisha: plan.creditUsedPoisha,
      creditLeftPoisha: plan.creditLeftPoisha,
      toPayPoisha: plan.toPayPoisha,
    },
    ip: input.meta.ip,
    userAgent: input.meta.userAgent,
  });
  return { id: created.id, orderNumber, toPayPoisha: plan.toPayPoisha };
}

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Say why the request is refused.").max(300),
});

export async function rejectReturn(
  staff: StaffContext,
  returnId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "return.manage");
  const input = parse(rejectSchema, raw);
  const result = await withLockedReturn(staff, returnId, async ({ uow, tx, order, request }) => {
    assertStep(request, "REJECT");
    await tx.updateRequest(request.id, {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: input.reason,
    });
    await auditReturn(uow, staff.userId, meta, {
      action: AUDIT_ACTIONS.returnRejected,
      returnId: request.id,
      locationId: order.locationId,
      before: { status: request.status },
      after: { status: "REJECTED", reason: input.reason },
    });
    return { reference: request.reference, orderNumber: order.orderNumber };
  });
  await notify({ type: "return.rejected", ...result });
  return result;
}

export async function receiveReturn(staff: StaffContext, returnId: string, meta: RequestMeta) {
  assertPermission(staff, "return.manage");
  return withLockedReturn(staff, returnId, async ({ uow, tx, order, request }) => {
    assertStep(request, "RECEIVE");
    await tx.updateRequest(request.id, { status: "RECEIVED", receivedAt: new Date() });
    await auditReturn(uow, staff.userId, meta, {
      action: AUDIT_ACTIONS.returnReceived,
      returnId: request.id,
      locationId: order.locationId,
      before: { status: request.status },
      after: { status: "RECEIVED" },
    });
    return { reference: request.reference };
  });
}

// ---------------------------------------------------------------------------
// inspect and close
// ---------------------------------------------------------------------------

const inspectSchema = z.object({
  locationId: z.string().min(1).max(40),
  items: z
    .array(
      z.object({
        returnItemId: z.string().min(1).max(40),
        result: z.enum(["ACCEPTED", "DAMAGED", "REJECTED"]),
        note: z.string().trim().max(300).optional().default(""),
      }),
    )
    .min(1),
});

/**
 * Inspection per item: sellable units go back into stock at the chosen
 * location (RETURN), damaged ones come back and are written off (RETURN then
 * DAMAGE), rejected ones are not accepted (nothing moves; no refund).
 */
export async function inspectReturn(
  staff: StaffContext,
  returnId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "return.manage");
  const input = parse(inspectSchema, raw);
  assertLocationAccess(staff, input.locationId);
  return withLockedReturn(staff, returnId, async ({ uow, orderTx, tx, order, request }) => {
    assertStep(request, "INSPECT");
    const location = await orderTx.findActiveLocation(input.locationId);
    if (location === null) throw invalid("Choose an active location.", "locationId");
    const byId = new Map(input.items.map((item) => [item.returnItemId, item]));
    if (byId.size !== request.items.length || request.items.some((item) => !byId.has(item.id))) {
      throw invalid("Give a result for every item.", "items");
    }
    const at = new Date();
    const movements = [];
    for (const item of request.items) {
      const verdict = byId.get(item.id)!;
      const variantId = item.orderItem.variantId;
      const base = {
        locationId: location.id,
        referenceType: "RETURN",
        referenceId: request.id,
        userId: staff.userId,
      };
      if (verdict.result !== "REJECTED" && variantId !== null) {
        movements.push({
          ...base,
          variantId,
          type: "RETURN" as const,
          quantity: item.quantity,
          reasonCode: "CUSTOMER_RETURN",
          reason: `Return ${request.reference} (${order.orderNumber})`,
        });
        if (verdict.result === "DAMAGED") {
          movements.push({
            ...base,
            variantId,
            type: "DAMAGE" as const,
            quantity: -item.quantity,
            reasonCode: "DAMAGED",
            reason: `Returned damaged: ${request.reference}`,
          });
        }
      }
      await tx.updateItem(item.id, {
        inspectionResult: verdict.result,
        inspectionNote: verdict.note === "" ? null : verdict.note,
        restockLocationId: verdict.result === "ACCEPTED" ? location.id : null,
        restockedAt: verdict.result === "ACCEPTED" ? at : null,
      });
    }
    if (movements.length > 0) await applyStockMovements(uow, movements);
    await tx.updateRequest(request.id, { status: "INSPECTED", inspectedAt: at });
    const counts = { accepted: 0, damaged: 0, rejected: 0 };
    for (const item of input.items) {
      if (item.result === "ACCEPTED") counts.accepted += 1;
      else if (item.result === "DAMAGED") counts.damaged += 1;
      else counts.rejected += 1;
    }
    await auditReturn(uow, staff.userId, meta, {
      action: AUDIT_ACTIONS.returnInspected,
      returnId: request.id,
      locationId: location.id,
      before: { status: request.status },
      after: { status: "INSPECTED", location: location.code, ...counts },
    });
    return { reference: request.reference, ...counts };
  });
}

/** What the request still owes the customer, in poisha (for closing and the refund form). */
export function outstandingRefund(request: {
  type: string;
  status: string;
  items: ReadonlyArray<{ inspectionResult: string; creditPoisha: number }>;
  refunds: ReadonlyArray<{ status: string; amountPoisha: number; shippingRefundPoisha: number }>;
  exchangeCreditUsedPoisha: number;
}): number {
  const accepted = request.items
    .filter((item) => item.inspectionResult === "ACCEPTED" || item.inspectionResult === "DAMAGED")
    .reduce((sum, item) => sum + item.creditPoisha, 0);
  const refunded = request.refunds
    .filter((refund) => refund.status === "COMPLETED" || refund.status === "PENDING")
    .reduce((sum, refund) => sum + refund.amountPoisha - refund.shippingRefundPoisha, 0);
  const owed = request.type === "EXCHANGE" ? accepted - request.exchangeCreditUsedPoisha : accepted;
  return Math.max(0, owed - refunded);
}

export async function closeReturn(staff: StaffContext, returnId: string, meta: RequestMeta) {
  assertPermission(staff, "return.manage");
  return withLockedReturn(staff, returnId, async ({ uow, tx, order, request }) => {
    assertStep(request, "CLOSE");
    if (request.refunds.some((refund) => refund.status === "PENDING")) {
      throw conflict("A refund is still waiting for approval.");
    }
    const exchangeCredit = await exchangeCreditUsed(request);
    const owed = outstandingRefund({ ...request, exchangeCreditUsedPoisha: exchangeCredit });
    if (owed > 0) throw conflict("Record the refund before closing.");
    await tx.updateRequest(request.id, {
      status: "COMPLETED",
      completedAt: new Date(),
      closedByUserId: staff.userId,
    });
    await auditReturn(uow, staff.userId, meta, {
      action: AUDIT_ACTIONS.returnClosed,
      returnId: request.id,
      locationId: order.locationId,
      before: { status: request.status },
      after: { status: "COMPLETED" },
    });
    return { reference: request.reference };
  });
}

/** The EXCHANGE_CREDIT paid on the replacement order (0 for a plain return). */
async function exchangeCreditUsed(request: { exchangeOrderId: string | null }): Promise<number> {
  return request.exchangeOrderId === null ? 0 : findExchangeCreditPayment(request.exchangeOrderId);
}

// ---------------------------------------------------------------------------
// reads for the admin
// ---------------------------------------------------------------------------

export const RETURN_TABS = [
  { key: "open", label: "Open", statuses: ["REQUESTED", "APPROVED", "RECEIVED", "INSPECTED"] },
  { key: "requested", label: "New", statuses: ["REQUESTED"] },
  { key: "closed", label: "Closed", statuses: ["COMPLETED"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED", "CANCELLED"] },
  { key: "all", label: "All", statuses: [] },
] as const;

const listSchema = z.object({
  tab: z.enum(["open", "requested", "closed", "rejected", "all"]).catch("open"),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export async function listReturnsForStaff(staff: StaffContext, raw: Record<string, unknown>) {
  assertPermission(staff, "return.manage");
  const query = listSchema.parse(raw);
  const result = await listReturns({
    statuses: RETURN_TABS.find((tab) => tab.key === query.tab)?.statuses ?? [],
    search: query.q === undefined || query.q === "" ? null : query.q,
    locationIds: locationScope(staff),
    page: query.page,
    pageSize: PAGE_SIZE.admin,
  });
  return { ...result, tab: query.tab, page: query.page, pageSize: PAGE_SIZE.admin };
}

export async function getReturnForStaff(staff: StaffContext, returnId: string) {
  assertPermission(staff, "return.manage");
  const request = await findReturnDetail(returnId);
  if (request === null) throw new AppError("NOT_FOUND", "Return not found.");
  assertLocationAccess(staff, request.order.locationId);
  const showPhone = hasPermission(staff, "customer.read");
  const creditUsed = await exchangeCreditUsed(request);
  return {
    request: {
      ...request,
      order: {
        ...request.order,
        customerPhone: showPhone
          ? request.order.customerPhone
          : maskBdMobile(request.order.customerPhone),
      },
    },
    exchangeCreditUsedPoisha: creditUsed,
    outstandingPoisha: outstandingRefund({ ...request, exchangeCreditUsedPoisha: creditUsed }),
    canRecordRefund: hasPermission(staff, "refund.record"),
    canApproveRefund: hasPermission(staff, "refund.approve"),
  };
}

/** The order lines a staff member may start a return or exchange for. */
export async function getReturnStart(staff: StaffContext, orderId: string) {
  assertPermission(staff, "return.manage");
  const [order, settings] = await Promise.all([findOrderForReturn(orderId), getReturnsSettings()]);
  if (order === null) throw new AppError("NOT_FOUND", "Order not found.");
  assertLocationAccess(staff, order.locationId);
  if (order.status !== "DELIVERED") throw conflict("Only delivered orders can be returned.");
  const requested = new Map<string, number>();
  for (const request of order.returnRequests) {
    for (const item of request.items) {
      requested.set(item.orderItemId, (requested.get(item.orderItemId) ?? 0) + item.quantity);
    }
  }
  const productIds = [
    ...new Set(
      order.items
        .map((item) => item.variant?.productId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
  const variants = await findProductVariants(productIds);
  const stockAt =
    order.channel === "ONLINE"
      ? await getAvailability(
          { online: true },
          variants.map((variant) => variant.id),
        )
      : await getAvailability(
          { locationId: order.locationId },
          variants.map((variant) => variant.id),
        );
  return {
    order: { id: order.id, orderNumber: order.orderNumber, channel: order.channel },
    insideWindow: isWithinWindow(order.deliveredAt, new Date(), settings.windowDays),
    windowDays: settings.windowDays,
    items: order.items.map((item) => ({
      orderItemId: item.id,
      sku: item.sku,
      name: [item.productNameEn, item.sizeLabelEn, item.colourLabelEn].filter(Boolean).join(" · "),
      quantity: item.quantity,
      returnable: returnableQuantity(item.quantity, requested.get(item.id) ?? 0),
      exchangeOptions: variants
        .filter(
          (variant) =>
            variant.productId === item.variant?.productId && variant.id !== item.variantId,
        )
        .map((variant) => ({
          variantId: variant.id,
          label: `${variant.labelEn ?? variant.sku} (${stockAt.get(variant.id) ?? 0} in stock)`,
          inStock: (stockAt.get(variant.id) ?? 0) > 0,
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// return policy page
// ---------------------------------------------------------------------------

/**
 * The policy is linked from checkout and tracking only once someone with
 * return.policy.publish has approved and published it (owner rule).
 */
export async function isReturnPolicyPublished(): Promise<boolean> {
  try {
    const [page, settings] = await Promise.all([findReturnPolicyPage(), getReturnsSettings()]);
    return settings.policyApproved && page?.status === "PUBLISHED";
  } catch {
    return false;
  }
}

export async function getReturnPolicyStatus(staff: StaffContext) {
  assertPermission(staff, "return.policy.publish");
  const [page, settings] = await Promise.all([findReturnPolicyPage(), getReturnsSettings()]);
  return {
    published: settings.policyApproved && page?.status === "PUBLISHED",
    publishedAt: page?.publishedAt ?? null,
    settings,
  };
}

export async function setReturnPolicy(staff: StaffContext, publish: boolean, meta: RequestMeta) {
  assertPermission(staff, "return.policy.publish");
  const before = await findReturnPolicyPage();
  const page = await setReturnPolicyPublished(publish, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: publish ? AUDIT_ACTIONS.returnPolicyPublished : AUDIT_ACTIONS.returnPolicyUnpublished,
    entityType: "page",
    entityId: page.id,
    before: { status: before?.status ?? null },
    after: { status: publish ? "PUBLISHED" : "DRAFT", approvedBy: staff.userId },
    meta,
  });
}
