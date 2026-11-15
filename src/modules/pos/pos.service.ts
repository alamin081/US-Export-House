import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { parseTakaInput } from "@/lib/money";
import {
  assertLocationAccess,
  assertPermission,
  canAccessLocation,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { hashPassword, verifyPassword } from "@/modules/access/password";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { findCartVariants, findCategoryAncestors } from "@/modules/cart/cart.repository";
import { formatOrderNumber } from "@/modules/checkout/checkout-rules";
import { evaluateCoupon, normalizeCouponCode } from "@/modules/checkout/coupon-rules";
import { normalizeBdMobile } from "@/modules/checkout/phone";
import type { PricedLine } from "@/modules/checkout/pricing";
import {
  applyStockMovements,
  getAvailability,
  listStaffLocations,
  parse,
} from "@/modules/inventory/inventory.service";
import {
  runInventoryTransaction,
  type InventoryUnitOfWork,
} from "@/modules/inventory/inventory.repository";
import { issueInvoiceInTx } from "@/modules/invoices/invoice.service";
import { conflict, invalid } from "@/modules/orders/order-context";
import { OrderTx } from "@/modules/orders/orders.repository";
import { reserveThrottleAttempt } from "@/modules/returns/returns.repository";
import { countersFor, discountLimitFor } from "@/modules/settings/pos-settings";
import { getCheckoutSettings, getPosSettings } from "@/modules/settings/settings.service";
import {
  buildZReport,
  exceedsDiscountLimit,
  priceTill,
  settlePayments,
  TILL_METHODS,
  type PaymentProblem,
} from "./pos-rules";
import {
  createHeldBill,
  findApprover,
  findOpenSessions,
  findPasswordHash,
  findSaleByNumber,
  findSaleForReceipt,
  findSession,
  findSessionFigures,
  findTillVariant,
  isClosedDayError,
  listHeldBills,
  listRecentSessions,
  PosTx,
  searchTillVariants,
  setPinHash,
  takeHeldBill,
} from "./pos.repository";

/**
 * The shop till: a day per counter (opening float, Z-report on close),
 * selling with scanned items, discounts within the seller's limit (a manager
 * PIN for more), STORE coupons, split payments with change, held bills and
 * receipts. A sale is one transaction: the order (STORE, DELIVERED, PAID), the
 * stock (SALE_STORE, straight off the shelf), the payments and the invoice
 * (its number is the bill number).
 */

export const DAY_PREFIX = "DAY";

function money(text: string, field: string): number {
  const value = parseTakaInput(text);
  if (value === null || value < 0) throw invalid("Enter an amount in taka.", field);
  return value;
}

// ---------------------------------------------------------------------------
// days
// ---------------------------------------------------------------------------

/** Locations and counters the staff member may sell at, with their open days. */
export async function getTillContext(staff: StaffContext) {
  assertPermission(staff, "pos.sell");
  const settings = await getPosSettings();
  const locations = await listStaffLocations(staff);
  const open = await findOpenSessions(locationScope(staff));
  return {
    canManageDay: hasPermission(staff, "pos.day.manage"),
    receiptWidthMm: settings.receiptWidthMm,
    discountLimitPercent: discountLimitFor(settings, staff.roleName),
    locations: locations.map((location) => ({
      id: location.id,
      code: location.code,
      nameEn: location.nameEn,
      counters: countersFor(settings, location.code).map((counter) => ({
        code: counter,
        session:
          open.find(
            (session) => session.locationId === location.id && session.counterCode === counter,
          ) ?? null,
      })),
    })),
  };
}

const openSchema = z.object({
  locationId: z.string().min(1).max(40),
  counterCode: z
    .string()
    .regex(/^[A-Z0-9-]{1,12}$/)
    .default("MAIN"),
  openingFloat: z.string().trim().max(20).default("0"),
});

export async function openDay(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "pos.day.manage");
  const input = parse(openSchema, raw);
  assertLocationAccess(staff, input.locationId);
  const settings = await getPosSettings();
  const float = input.openingFloat === "" ? 0 : money(input.openingFloat, "openingFloat");
  try {
    return await runInventoryTransaction(async (uow) => {
      const tx = new PosTx(uow);
      const orderTx = new OrderTx(uow);
      const location = await orderTx.findActiveLocation(input.locationId);
      if (location === null) throw invalid("Choose an active location.", "locationId");
      if (!countersFor(settings, location.code).includes(input.counterCode)) {
        throw invalid("That counter does not exist here.", "counterCode");
      }
      const now = new Date();
      const session = await tx.createSession({
        reference: formatOrderNumber(DAY_PREFIX, now, await tx.nextSessionSequence()),
        locationId: location.id,
        counterCode: input.counterCode,
        openingFloatPoisha: float,
        openedByUserId: staff.userId,
        openedAt: now,
      });
      await uow.audit({
        userId: staff.userId,
        action: AUDIT_ACTIONS.posDayOpened,
        entityType: "pos_session",
        entityId: session.id,
        locationId: location.id,
        after: {
          reference: session.reference,
          counter: input.counterCode,
          openingFloatPoisha: float,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return session;
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("PosSession_one_open_per_counter")) {
      throw conflict("This counter already has an open day.");
    }
    if (JSON.stringify(error).includes("P2002"))
      throw conflict("This counter already has an open day.");
    throw error;
  }
}

/** The day with its live figures (or the frozen Z-report once closed). */
export async function getDay(staff: StaffContext, sessionId: string) {
  assertPermission(staff, "pos.sell");
  const session = await findSession(sessionId);
  if (session === null) throw new AppError("NOT_FOUND", "Till day not found.");
  assertLocationAccess(staff, session.locationId);
  const figures = await findSessionFigures(session.id);
  const report = buildZReport({
    openingFloatPoisha: session.openingFloatPoisha,
    sales: figures.sales,
    payments: figures.payments,
    refunds: figures.refunds,
    countedCashPoisha: session.countedCashPoisha,
  });
  return {
    session,
    report,
    sales: figures.sales,
    canClose: hasPermission(staff, "pos.day.manage") && session.status === "OPEN",
  };
}

const closeSchema = z.object({
  countedCash: z.string().trim().min(1, "Count the cash in the drawer.").max(20),
  reason: z.string().trim().max(300).optional().default(""),
});

/**
 * Closes the day: the counted cash against the expected, a reason when they
 * differ, and the Z-report frozen. From then on, the day's bills are locked
 * (service and database triggers).
 */
export async function closeDay(
  staff: StaffContext,
  sessionId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "pos.day.manage");
  const input = parse(closeSchema, raw);
  const counted = money(input.countedCash, "countedCash");
  return runInventoryTransaction(async (uow) => {
    const tx = new PosTx(uow);
    const session = await tx.lockSession(sessionId, "update");
    if (session === null) throw new AppError("NOT_FOUND", "Till day not found.");
    assertLocationAccess(staff, session.locationId);
    if (session.status !== "OPEN") throw conflict("This day is already closed.");
    const figures = await tx.sessionFigures(session.id);
    const report = buildZReport({
      openingFloatPoisha: session.openingFloatPoisha,
      sales: figures.sales,
      payments: figures.payments,
      refunds: figures.refunds,
      countedCashPoisha: counted,
    });
    if (report.differencePoisha !== 0 && input.reason.length < 3) {
      throw invalid(
        `The drawer is ${report.differencePoisha! > 0 ? "over" : "short"} by ৳${Math.abs(report.differencePoisha!) / 100}. Write the reason.`,
        "reason",
      );
    }
    const now = new Date();
    await tx.closeSession(session.id, {
      status: "CLOSED",
      closedAt: now,
      closedByUserId: staff.userId,
      expectedCashPoisha: report.expectedCashPoisha,
      countedCashPoisha: counted,
      differencePoisha: report.differencePoisha,
      differenceReason: input.reason === "" ? null : input.reason,
      zReport: { ...report, reference: session.reference, closedAt: now.toISOString() },
    });
    await uow.audit({
      userId: staff.userId,
      action: AUDIT_ACTIONS.posDayClosed,
      entityType: "pos_session",
      entityId: session.id,
      locationId: session.locationId,
      before: { status: "OPEN" },
      after: {
        status: "CLOSED",
        bills: report.bills,
        netSalesPoisha: report.netSalesPoisha,
        expectedCashPoisha: report.expectedCashPoisha,
        countedCashPoisha: counted,
        differencePoisha: report.differencePoisha,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { reference: session.reference, report };
  });
}

export async function listDays(staff: StaffContext) {
  assertPermission(staff, "pos.sell");
  return listRecentSessions(locationScope(staff));
}

// ---------------------------------------------------------------------------
// lookup
// ---------------------------------------------------------------------------

export interface TillItem {
  variantId: string;
  sku: string;
  barcode: string | null;
  name: string;
  pricePoisha: number;
  available: number;
  sellable: boolean;
}

export async function lookupTillItem(
  staff: StaffContext,
  locationId: string,
  query: { code?: string | null; q?: string | null },
): Promise<{ item: TillItem | null; items: TillItem[] }> {
  assertPermission(staff, "pos.sell");
  assertLocationAccess(staff, locationId);
  const code = query.code?.trim() ?? "";
  const rows =
    code !== ""
      ? [await findTillVariant(code)].filter((row) => row !== null)
      : (query.q ?? "").trim().length >= 2
        ? await searchTillVariants((query.q ?? "").trim())
        : [];
  const available = await getAvailability(
    { locationId },
    rows.map((row) => row.id),
  );
  const items = rows.map((row) => ({
    variantId: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: [row.product.nameEn, row.labelEn].filter(Boolean).join(" · "),
    pricePoisha: row.pricePoisha,
    available: available.get(row.id) ?? 0,
    sellable: row.isActive && row.product.deletedAt === null,
  }));
  return { item: code !== "" ? (items[0] ?? null) : null, items };
}

// ---------------------------------------------------------------------------
// selling
// ---------------------------------------------------------------------------

const discountSchema = z
  .object({ kind: z.enum(["PERCENT", "AMOUNT"]), value: z.string().trim().max(20) })
  .nullable()
  .default(null);

const saleSchema = z.object({
  sessionId: z.string().min(1).max(40),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1).max(40),
        quantity: z.coerce.number().int().min(1).max(500),
        discount: discountSchema,
      }),
    )
    .min(1, "Add at least one item.")
    .max(200),
  billDiscount: discountSchema,
  couponCode: z.string().trim().max(40).optional().default(""),
  customerName: z.string().trim().max(80).optional().default(""),
  customerPhone: z.string().trim().max(30).optional().default(""),
  payments: z
    .array(
      z.object({
        method: z.enum(TILL_METHODS as ["CASH", "CARD", "BKASH", "NAGAD"]),
        amount: z.string().trim().max(20),
        tendered: z.string().trim().max(20).optional().default(""),
        reference: z.string().trim().max(80).optional().default(""),
      }),
    )
    .max(6),
  approval: z
    .object({ email: z.string().trim().max(120), pin: z.string().regex(/^\d{4,8}$/) })
    .nullable()
    .default(null),
});

const PAYMENT_PROBLEMS: Record<PaymentProblem, string> = {
  NONE: "Add how the customer pays.",
  NOT_POSITIVE: "Each payment must be more than zero.",
  SUM_MISMATCH: "The payments do not add up to the bill.",
  TENDER_SHORT: "The cash handed over is less than the cash part.",
  REFERENCE_MISSING: "Card, bKash and Nagad payments need a reference number.",
  TWO_CASH_LINES: "Use one cash line.",
};

/** Raised when the discount is above the seller's limit and no valid manager PIN came with it. */
export class DiscountApprovalNeeded extends AppError {
  constructor(limitPercent: number) {
    super(
      "FORBIDDEN",
      `This discount is above your ${limitPercent}% limit. A manager must approve it.`,
      {
        details: { field: "approval", needsApproval: true },
      },
    );
  }
}

function discountValue(discount: { kind: "PERCENT" | "AMOUNT"; value: string } | null) {
  if (discount === null || discount.value === "") return null;
  if (discount.kind === "PERCENT") {
    const percent = Number(discount.value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw invalid("A percentage discount is between 0 and 100.", "discount");
    }
    return { kind: "PERCENT" as const, value: percent };
  }
  return { kind: "AMOUNT" as const, value: money(discount.value, "discount") };
}

/** A manager approves with their email and till PIN (tries limited per manager). */
async function checkApprover(
  approval: { email: string; pin: string },
  locationId: string,
  meta: RequestMeta,
): Promise<string> {
  const settings = await getPosSettings();
  const user = await findApprover(approval.email);
  const refuse = () =>
    new AppError("FORBIDDEN", "That manager PIN is not accepted.", {
      details: { field: "approval" },
    });
  if (
    user === null ||
    user.posPinHash === null ||
    user.role === null ||
    user.role.deletedAt !== null
  ) {
    throw refuse();
  }
  const tries = await reserveThrottleAttempt(`pos-pin:${user.id}`, 15 * 60);
  if (tries > settings.pinAttemptsPer15Min) {
    throw new AppError("RATE_LIMITED", "Too many PIN tries for this manager. Wait 15 minutes.");
  }
  const allowed =
    user.role.permissions.includes("pos.discount.override") &&
    (user.role.allLocations || user.locationAccess.some((row) => row.locationId === locationId));
  if (!allowed || !(await verifyPassword(user.posPinHash, approval.pin))) {
    await recordAudit({
      actorUserId: null,
      action: AUDIT_ACTIONS.posDiscountOverride,
      entityType: "user",
      entityId: user.id,
      after: { result: "refused" },
      meta,
    });
    throw refuse();
  }
  return user.id;
}

export interface SaleResult {
  orderId: string;
  orderNumber: string;
  billNumber: string;
  totalPoisha: number;
  changePoisha: number;
  reused: boolean;
}

export async function sell(
  staff: StaffContext,
  raw: unknown,
  meta: RequestMeta,
): Promise<SaleResult> {
  assertPermission(staff, "pos.sell");
  const input = parse(saleSchema, raw);
  const session = await findSession(input.sessionId);
  if (session === null) throw new AppError("NOT_FOUND", "Till day not found.");
  assertLocationAccess(staff, session.locationId);
  if (session.status !== "OPEN") throw conflict("This till day is closed. Open a new day to sell.");

  const [posSettings, checkoutSettings] = await Promise.all([
    getPosSettings(),
    getCheckoutSettings(),
  ]);
  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  if (variantIds.length !== input.lines.length) throw invalid("An item is listed twice.", "lines");
  const variants = new Map((await findCartVariants(variantIds)).map((row) => [row.id, row]));
  const ancestors = await findCategoryAncestors([
    ...new Set(
      [...variants.values()].flatMap((variant) => [
        variant.product.categoryId,
        ...variant.product.extraCategories.map((link) => link.categoryId),
      ]),
    ),
  ]);
  const phone = input.customerPhone === "" ? null : normalizeBdMobile(input.customerPhone);
  if (phone !== null && !phone.ok)
    throw invalid("Enter a Bangladeshi mobile number.", "customerPhone");
  const lineDiscounts = input.lines.map((line) => discountValue(line.discount));
  const billDiscount = discountValue(input.billDiscount);
  const limit = discountLimitFor(posSettings, staff.roleName);

  try {
    return await runInventoryTransaction(async (uow) => {
      const tx = new PosTx(uow);
      const orderTx = new OrderTx(uow);
      const same = await tx.findOrderByIdempotencyKey(input.idempotencyKey);
      if (same !== null) {
        return {
          orderId: same.id,
          orderNumber: same.orderNumber,
          billNumber: same.orderNumber,
          totalPoisha: same.totalPoisha,
          changePoisha: 0,
          reused: true,
        };
      }
      // Lock order: session (share) -> coupon -> stock rows.
      const locked = await tx.lockSession(session.id, "share");
      if (locked === null || locked.status !== "OPEN")
        throw conflict("This till day was just closed.");

      const prices = await tx.variantPrices(variantIds);
      const priced: PricedLine[] = input.lines.map((line) => {
        const variant = variants.get(line.variantId);
        const price = prices.get(line.variantId);
        if (variant === undefined || price === undefined || variant.product.deletedAt !== null) {
          throw invalid("An item is no longer for sale.", "lines");
        }
        return {
          key: line.variantId,
          unitPricePoisha: price,
          compareAtPoisha: variant.comparePricePoisha,
          quantity: line.quantity,
          productId: variant.product.id,
          categoryIds: [
            ...new Set(
              [
                variant.product.categoryId,
                ...variant.product.extraCategories.map((link) => link.categoryId),
              ].flatMap((id) => ancestors.get(id) ?? [id]),
            ),
          ],
        };
      });

      let coupon: Awaited<ReturnType<PosTx["lockCouponByCode"]>> = null;
      let couponEffect: { discountPoisha: number; eligibleKeys: readonly string[] } | null = null;
      const code = input.couponCode === "" ? "" : normalizeCouponCode(input.couponCode);
      if (code !== "") {
        coupon = await tx.lockCouponByCode(code);
        const evaluated = evaluateCoupon({
          coupon: coupon === null ? null : { ...coupon, scopes: coupon.scopes },
          lines: priced,
          now: new Date(),
          usesByPhone: 0,
          couponOnSaleItems: checkoutSettings.couponOnSaleItems,
          channel: "STORE",
        });
        if (!evaluated.ok) throw invalid("That coupon cannot be used here.", "couponCode");
        couponEffect = evaluated.effect;
      }

      const totals = priceTill({
        lines: priced.map((line, index) => ({
          variantId: line.key,
          unitPricePoisha: line.unitPricePoisha,
          quantity: line.quantity,
          discount: lineDiscounts[index] ?? null,
        })),
        billDiscount,
        coupon: couponEffect,
      });

      let approvedBy: string | null = null;
      if (exceedsDiscountLimit(totals.manualDiscountPoisha, totals.subtotalPoisha, limit)) {
        if (input.approval === null) throw new DiscountApprovalNeeded(limit ?? 0);
        approvedBy = await checkApprover(input.approval, session.locationId, meta);
      }

      const settled = settlePayments(
        totals.totalPoisha,
        input.payments.map((payment) => ({
          method: payment.method,
          amountPoisha: payment.amount === "" ? 0 : money(payment.amount, "payments"),
          tenderedPoisha: payment.tendered === "" ? null : money(payment.tendered, "payments"),
          reference: payment.reference,
        })),
      );
      if (!settled.ok) throw invalid(PAYMENT_PROBLEMS[settled.problem], "payments");

      if (coupon !== null && !(await tx.takeCouponUse(coupon.id))) {
        throw invalid("That coupon has been used up.", "couponCode");
      }

      const now = new Date();
      const orderNumber = formatOrderNumber(
        checkoutSettings.orderNumberPrefix,
        now,
        await tx.nextOrderSequence(),
      );
      const byVariant = new Map(totals.lines.map((line) => [line.variantId, line]));
      const option = (variantId: string, type: "SIZE" | "COLOUR") =>
        variants.get(variantId)!.optionValues.find((link) => link.optionValue.option.type === type)
          ?.optionValue ?? null;
      const costs = await orderTx.variantCosts(variantIds);
      const created = await tx.createSale({
        orderNumber,
        idempotencyKey: input.idempotencyKey,
        channel: "STORE",
        locationId: session.locationId,
        posSessionId: session.id,
        soldByUserId: staff.userId,
        customerName: input.customerName === "" ? "Walk-in customer" : input.customerName,
        customerPhone: phone?.ok === true ? phone.phone : "",
        status: "DELIVERED",
        paymentStatus: "PAID",
        paymentMethod:
          settled.payments.length === 1
            ? settled.payments[0]!.method
            : (settled.payments[0]?.method ?? "CASH"),
        subtotalPoisha: totals.subtotalPoisha,
        discountPoisha: totals.discountPoisha,
        manualDiscountPoisha: totals.manualDiscountPoisha,
        discountApprovedByUserId: approvedBy,
        shippingPoisha: 0,
        totalPoisha: totals.totalPoisha,
        paidPoisha: totals.totalPoisha,
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        placedAt: now,
        confirmedAt: now,
        deliveredAt: now,
        soldAt: now,
        items: {
          create: priced.map((line) => {
            const variant = variants.get(line.key)!;
            const total = byVariant.get(line.key)!;
            const size = option(line.key, "SIZE");
            const colour = option(line.key, "COLOUR");
            return {
              variantId: line.key,
              productNameEn: variant.product.nameEn,
              productNameBn: variant.product.nameBn,
              variantLabel: variant.labelEn,
              sku: variant.sku,
              imageUrl: variant.product.images[0]?.url ?? null,
              unitPricePoisha: line.unitPricePoisha,
              unitCostPoisha: costs.get(line.key) ?? null,
              quantity: line.quantity,
              lineTotalPoisha: total.lineTotalPoisha,
              discountPoisha: total.discountPoisha,
              manualDiscountPoisha: total.manualDiscountPoisha,
              sizeLabelEn: size?.valueEn ?? null,
              sizeLabelBn: size?.valueBn ?? null,
              colourLabelEn: colour?.valueEn ?? null,
              colourLabelBn: colour?.valueBn ?? null,
            };
          }),
        },
        statusHistory: {
          create: {
            status: "DELIVERED",
            noteEn: `Sold at ${locked.location.code} (${session.counterCode}).`,
            userId: staff.userId,
          },
        },
        payments: {
          create: settled.payments.map((payment) => ({
            provider: payment.method,
            mode: "LIVE" as const,
            status: "PAID" as const,
            amountPoisha: payment.amountPoisha,
            tenderedPoisha: payment.tenderedPoisha,
            changePoisha: payment.changePoisha,
            providerReference: payment.reference,
            paidAt: now,
            posSessionId: session.id,
            recordedByUserId: staff.userId,
          })),
        },
        ...(coupon === null
          ? {}
          : {
              redemption: {
                create: {
                  couponId: coupon.id,
                  customerPhone: phone?.ok === true ? phone.phone : null,
                  discountPoisha: totals.couponDiscountPoisha,
                },
              },
            }),
      });
      await applyStockMovements(
        uow,
        priced.map((line) => ({
          variantId: line.key,
          locationId: session.locationId,
          type: "SALE_STORE" as const,
          quantity: -line.quantity,
          unitCostPoisha: costs.get(line.key) ?? null,
          referenceType: "ORDER",
          referenceId: created.id,
          userId: staff.userId,
          reason: `Till sale ${orderNumber}`,
        })),
      );
      const invoice = await issueInvoiceInTx({
        uow,
        tx: orderTx,
        orderId: created.id,
        current: null,
        reason: null,
        userId: staff.userId,
        meta,
        now,
      });
      await auditSale(uow, staff, meta, {
        orderId: created.id,
        locationId: session.locationId,
        after: {
          orderNumber,
          bill: invoice.number,
          totalPoisha: totals.totalPoisha,
          manualDiscountPoisha: totals.manualDiscountPoisha,
          approvedBy,
          payments: settled.payments.map((payment) => `${payment.method}:${payment.amountPoisha}`),
        },
      });
      return {
        orderId: created.id,
        orderNumber,
        billNumber: invoice.number,
        totalPoisha: totals.totalPoisha,
        changePoisha: settled.changePoisha,
        reused: false,
      };
    });
  } catch (error) {
    if (isClosedDayError(error)) throw conflict("This till day was just closed.");
    throw error;
  }
}

async function auditSale(
  uow: InventoryUnitOfWork,
  staff: StaffContext,
  meta: RequestMeta,
  entry: { orderId: string; locationId: string; after: unknown },
) {
  await uow.audit({
    userId: staff.userId,
    action: AUDIT_ACTIONS.posSale,
    entityType: "order",
    entityId: entry.orderId,
    locationId: entry.locationId,
    after: entry.after,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// ---------------------------------------------------------------------------
// held bills
// ---------------------------------------------------------------------------

const holdSchema = z.object({
  sessionId: z.string().min(1).max(40),
  label: z.string().trim().min(1, "Give the bill a name.").max(60),
  cart: z.record(z.string(), z.unknown()),
});

export async function holdBill(staff: StaffContext, raw: unknown) {
  assertPermission(staff, "pos.sell");
  const input = parse(holdSchema, raw);
  const session = await findSession(input.sessionId);
  if (session === null || session.status !== "OPEN") throw conflict("The till day is not open.");
  assertLocationAccess(staff, session.locationId);
  if (JSON.stringify(input.cart).length > 50_000) throw invalid("That bill is too large to hold.");
  return createHeldBill({
    sessionId: session.id,
    userId: staff.userId,
    label: input.label,
    cart: input.cart as Record<string, string>,
  });
}

export async function getHeldBills(staff: StaffContext, sessionId: string) {
  assertPermission(staff, "pos.sell");
  const session = await findSession(sessionId);
  if (session === null) throw new AppError("NOT_FOUND", "Till day not found.");
  assertLocationAccess(staff, session.locationId);
  return listHeldBills(sessionId);
}

/** Resuming takes the bill off the hold list (it is back on the screen). */
export async function resumeHeldBill(staff: StaffContext, sessionId: string, billId: string) {
  assertPermission(staff, "pos.sell");
  const session = await findSession(sessionId);
  if (session === null) throw new AppError("NOT_FOUND", "Till day not found.");
  assertLocationAccess(staff, session.locationId);
  const bill = await takeHeldBill(billId, sessionId);
  if (bill === null) throw new AppError("NOT_FOUND", "That held bill is gone.");
  return bill;
}

// ---------------------------------------------------------------------------
// manager PIN, receipts, finding a bill
// ---------------------------------------------------------------------------

const pinSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(200),
  pin: z.string().regex(/^\d{4,8}$/, "A PIN is 4 to 8 digits."),
});

/** A manager sets their own till PIN (confirmed with their password). */
export async function setOwnPin(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "pos.discount.override");
  const input = parse(pinSchema, raw);
  const hash = await findPasswordHash(staff.userId);
  if (hash === null || !(await verifyPassword(hash, input.password))) {
    throw invalid("The password is not right.", "password");
  }
  await setPinHash(staff.userId, await hashPassword(input.pin));
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.posPinSet,
    entityType: "user",
    entityId: staff.userId,
    meta,
  });
}

export async function getReceipt(staff: StaffContext, orderId: string) {
  assertPermission(staff, "pos.sell");
  const sale = await findSaleForReceipt(orderId);
  if (sale === null || sale.channel !== "STORE") throw new AppError("NOT_FOUND", "Bill not found.");
  assertLocationAccess(staff, sale.locationId);
  const settings = await getPosSettings();
  return { sale, widthMm: settings.receiptWidthMm };
}

/** A bill by its number (scanned from the receipt) or the order number. */
export async function findBill(staff: StaffContext, text: string) {
  assertPermission(staff, "pos.sell");
  const orderId = await findSaleByNumber(text);
  if (orderId === null) throw new AppError("NOT_FOUND", "No bill with that number.");
  const sale = await findSaleForReceipt(orderId);
  if (sale === null || !canAccessLocation(staff, sale.locationId)) {
    throw new AppError("NOT_FOUND", "No bill with that number.");
  }
  return { orderId };
}
