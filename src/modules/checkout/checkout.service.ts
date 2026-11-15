import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { env } from "@/config/env";
import { isAppError } from "@/lib/errors";
import type { RequestMeta } from "@/modules/audit/audit.service";
import { getCheckoutCart } from "@/modules/cart/cart.service";
import { applyStockMovements } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { notify } from "@/modules/notifications/notification.service";
import {
  getCustomerReturnOptions,
  isReturnPolicyPublished,
  type CustomerReturnOptions,
} from "@/modules/returns/returns.service";
import { getCheckoutSettings, type CheckoutSettings } from "@/modules/settings/settings.service";
import { resolveDeliveryArea, type DeliveryArea } from "@/modules/shipping/shipping.service";
import {
  checkOrderRateLimits,
  formatOrderNumber,
  reviewReasons as reviewReasonsFor,
} from "./checkout-rules";
import { generatePublicToken, issueFormToken, keyedHash, readFormToken } from "./checkout-crypto";
import {
  CheckoutTx,
  countCouponUsesByPhone,
  findCouponByCode,
  findOrderByIdempotencyKey,
  findOrderByPublicToken,
  findOrderForTracking,
  isUniqueViolation,
  peekThrottle,
  recordCheckoutRejection,
  reserveThrottleAttempt,
  type CouponRow,
  type OrderViewRow,
} from "./checkout.repository";
import { evaluateCoupon, normalizeCouponCode, type CouponFailure } from "./coupon-rules";
import { maskBdMobile, normalizeBdMobile } from "./phone";
import { buildQuote, itemsFingerprint, quoteHash, type PricedLine } from "./pricing";

/**
 * Guest checkout (cash on delivery). The browser sends ids, text and the
 * hash of the quote it showed; every amount is rebuilt here from the
 * database. The order, its stock reservation, the coupon use and the cart
 * clean-up commit together or not at all.
 */

// ---------------------------------------------------------------------------
// page data
// ---------------------------------------------------------------------------

/** Signed "form shown at" time, for the minimum fill time. */
export function newFormToken(now = Date.now()): string {
  return issueFormToken(now, env.AUTH_SECRET);
}

export function hashIp(ip: string | null): string | null {
  return ip === null ? null : keyedHash("ip", ip, env.AUTH_SECRET);
}

function hashPhone(phone: string | null): string | null {
  return phone === null ? null : keyedHash("phone", phone, env.AUTH_SECRET);
}

// ---------------------------------------------------------------------------
// quote
// ---------------------------------------------------------------------------

export type CouponProblem = CouponFailure["reason"] | "RATE_LIMITED";

export interface QuoteView {
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  freeShipping: boolean;
  toFreeShippingPoisha: number;
  zone: { code: string; nameEn: string; nameBn: string | null } | null;
  coupon: { code: string; labelEn: string | null; labelBn: string | null } | null;
  couponProblem: CouponProblem | null;
  couponMinPoisha: number | null;
  codAllowed: boolean;
  codMaxTotalPoisha: number;
  /** Echoed back on submit: the order is refused if the numbers moved. */
  hash: string;
}

const areaSchema = z.object({
  divisionId: z.string().max(20),
  districtId: z.string().max(20),
  upazilaId: z.string().max(20),
});

const quoteSchema = z.object({
  area: areaSchema.nullable(),
  couponCode: z.string().max(40).nullable(),
});

function toCouponRecord(row: CouponRow) {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    channel: row.channel,
    minSubtotalPoisha: row.minSubtotalPoisha,
    maxDiscountPoisha: row.maxDiscountPoisha,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    usageLimit: row.usageLimit,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
    usedCount: row.usedCount,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    scopes: row.scopes,
  };
}

/** The numbers for lines + area + an already-evaluated coupon. */
function priceOrder(input: {
  lines: readonly PricedLine[];
  area: DeliveryArea | null;
  coupon: CouponRow | null;
  couponResult: ReturnType<typeof evaluateCoupon> | null;
  settings: CheckoutSettings;
}): { view: QuoteView; lineDiscounts: Map<string, number> } {
  const effect = input.couponResult?.ok === true ? input.couponResult.effect : null;
  const quote = buildQuote({
    lines: input.lines,
    coupon: effect,
    zoneRatePoisha: input.area?.zone.ratePoisha ?? 0,
    freeShippingThresholdPoisha:
      input.area?.zone.freeThresholdPoisha ?? input.settings.freeShippingThresholdPoisha,
  });
  const appliedCode = effect !== null && input.coupon !== null ? input.coupon.code : null;
  const failure = input.couponResult?.ok === false ? input.couponResult : null;
  const view: QuoteView = {
    subtotalPoisha: quote.subtotalPoisha,
    discountPoisha: quote.discountPoisha,
    shippingPoisha: input.area === null ? 0 : quote.shippingPoisha,
    totalPoisha: input.area === null ? quote.totalPoisha - quote.shippingPoisha : quote.totalPoisha,
    freeShipping: quote.freeShipping,
    toFreeShippingPoisha: quote.toFreeShippingPoisha,
    zone:
      input.area === null
        ? null
        : {
            code: input.area.zone.code,
            nameEn: input.area.zone.nameEn,
            nameBn: input.area.zone.nameBn,
          },
    coupon:
      appliedCode === null || input.coupon === null
        ? null
        : { code: appliedCode, labelEn: input.coupon.labelEn, labelBn: input.coupon.labelBn },
    couponProblem: failure?.reason ?? null,
    couponMinPoisha: failure?.reason === "MIN_SUBTOTAL" ? failure.minPoisha : null,
    codAllowed: quote.totalPoisha <= input.settings.codMaxTotalPoisha,
    codMaxTotalPoisha: input.settings.codMaxTotalPoisha,
    hash: quoteHash({
      lines: input.lines,
      quote,
      zoneCode: input.area?.zone.code ?? null,
      couponCode: appliedCode,
    }),
  };
  return { view, lineDiscounts: quote.lineDiscounts };
}

/**
 * The checkout's live numbers for the current cart, address and coupon.
 * Invalid coupon tries count towards a per-IP limit (no code guessing).
 */
export async function quoteCheckout(
  cartToken: string | null,
  rawInput: unknown,
  meta: RequestMeta,
  phone: string | null = null,
): Promise<{ ok: true; quote: QuoteView } | { ok: false; error: "CART_EMPTY" | "INVALID_INPUT" }> {
  const parsed = quoteSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  const { lines, settings } = await getCheckoutCart(cartToken);
  if (lines.length === 0) return { ok: false, error: "CART_EMPTY" };
  const priced = lines.map((line) => line.priced);
  const area = parsed.data.area === null ? null : await resolveDeliveryArea(parsed.data.area);

  const code = parsed.data.couponCode === null ? "" : normalizeCouponCode(parsed.data.couponCode);
  let coupon: CouponRow | null = null;
  let couponResult: ReturnType<typeof evaluateCoupon> | null = null;
  let rateLimited = false;
  if (code !== "") {
    const throttleKey = `coupon:${hashIp(meta.ip) ?? "no-ip"}`;
    if ((await peekThrottle(throttleKey)) >= settings.couponAttemptsPer15Min) {
      rateLimited = true;
    } else {
      coupon = await findCouponByCode(code);
      couponResult = evaluateCoupon({
        coupon: coupon === null ? null : toCouponRecord(coupon),
        lines: priced,
        now: new Date(),
        usesByPhone:
          coupon === null || phone === null ? 0 : await countCouponUsesByPhone(coupon.id, phone),
        couponOnSaleItems: settings.couponOnSaleItems,
      });
      if (!couponResult.ok && couponResult.reason !== "MIN_SUBTOTAL") {
        await reserveThrottleAttempt(throttleKey, 15 * 60);
      }
    }
  }
  const quote = priceOrder({ lines: priced, area, coupon, couponResult, settings }).view;
  return {
    ok: true,
    quote: rateLimited ? { ...quote, couponProblem: "RATE_LIMITED" } : quote,
  };
}

// ---------------------------------------------------------------------------
// place order
// ---------------------------------------------------------------------------

export type CheckoutError =
  | "INVALID_INPUT"
  | "INVALID_PHONE"
  | "FORM_EXPIRED"
  | "TOO_FAST"
  | "CART_EMPTY"
  | "CART_CHANGED"
  | "ADDRESS_INVALID"
  | "COUPON_INVALID"
  | "QUOTE_CHANGED"
  | "OUT_OF_STOCK"
  | "COD_LIMIT"
  | "DUPLICATE"
  | "ORDER_LIMIT"
  | "NOT_ACCEPTED"
  | "FAILED";

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; publicToken: string; totalPoisha: number; reused: boolean }
  | {
      ok: false;
      error: CheckoutError;
      field?: string;
      orderNumber?: string;
      skus?: string[];
      quote?: QuoteView;
    };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

const placeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().max(30),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value === "" || z.email().safeParse(value).success)
    .transform((value) => (value === "" ? null : value.toLowerCase()))
    .nullable()
    .default(null),
  area: areaSchema,
  street: z.string().trim().min(5).max(200),
  landmark: optionalText(120),
  note: optionalText(300),
  couponCode: z.string().max(40).nullable().default(null),
  paymentMethod: z.literal("COD"),
  quoteHash: z.string().regex(/^[0-9a-f]{32}$/),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  formToken: z.string().max(80),
  /** Honeypot: hidden from people, filled in by simple bots. */
  website: z.string().max(200).default(""),
});

/** A refusal decided inside the transaction (which then rolls back). */
class Refusal extends Error {
  constructor(
    readonly reason: string,
    readonly result: Extract<PlaceOrderResult, { ok: false }>,
  ) {
    super(reason);
  }
}

const FORM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function placeOrder(
  cartToken: string | null,
  rawInput: unknown,
  meta: RequestMeta,
  now: () => Date = () => new Date(),
): Promise<PlaceOrderResult> {
  const ipHash = hashIp(meta.ip);
  const parsed = placeSchema.safeParse(rawInput);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error: "INVALID_INPUT",
      ...(field === undefined ? {} : { field: String(field) }),
    };
  }
  const input = parsed.data;
  const normalized = normalizeBdMobile(input.phone);
  if (!normalized.ok) return { ok: false, error: "INVALID_PHONE", field: "phone" };
  const phone = normalized.phone;
  const phoneHash = hashPhone(phone);

  const reject = async (reason: string, result: Extract<PlaceOrderResult, { ok: false }>) => {
    await recordCheckoutRejection({ reason, phoneHash, ipHash }).catch(() => {});
    return result;
  };

  // A retried submit (double tap, flaky network) gets the same order back.
  const earlier = await findOrderByIdempotencyKey(input.idempotencyKey);
  if (earlier !== null && earlier.publicToken !== null) {
    return { ok: true, ...earlier, publicToken: earlier.publicToken, reused: true };
  }

  if (input.website.trim() !== "") return reject("HONEYPOT", { ok: false, error: "NOT_ACCEPTED" });
  const settings = await getCheckoutSettings();
  const issuedAt = readFormToken(input.formToken, env.AUTH_SECRET);
  const nowMs = now().getTime();
  if (issuedAt === null || nowMs - issuedAt > FORM_MAX_AGE_MS || issuedAt > nowMs + 60_000) {
    return reject("FORM_TOKEN", { ok: false, error: "FORM_EXPIRED" });
  }
  if (nowMs - issuedAt < settings.minFillSeconds * 1000) {
    return reject("TOO_FAST", { ok: false, error: "TOO_FAST" });
  }

  const cart = await getCheckoutCart(cartToken);
  if (cart.cartId === null || cart.lines.length === 0) return { ok: false, error: "CART_EMPTY" };
  if (!cart.view.canCheckout) return { ok: false, error: "CART_CHANGED" };
  const area = await resolveDeliveryArea(input.area);
  if (area === null) return { ok: false, error: "ADDRESS_INVALID", field: "area" };
  const cartId = cart.cartId;
  const lines = cart.lines;
  const priced = lines.map((line) => line.priced);
  const units = priced.reduce((sum, line) => sum + line.quantity, 0);
  const fingerprint = itemsFingerprint(priced);
  const code = input.couponCode === null ? "" : normalizeCouponCode(input.couponCode);
  const placedAt = now();

  try {
    const placed = await runInventoryTransaction(async (uow) => {
      const tx = new CheckoutTx(uow);
      await tx.lockPhone(phone);

      const same = await tx.findOrderByIdempotencyKey(input.idempotencyKey);
      if (same !== null && same.publicToken !== null) {
        return { ...same, publicToken: same.publicToken, reused: true };
      }
      if (await tx.isPhoneBlocked(phone)) {
        throw new Refusal("BLOCKED_PHONE", { ok: false, error: "NOT_ACCEPTED" });
      }
      const limit = checkOrderRateLimits(
        {
          openOrdersForPhone: await tx.countOpenOrdersForPhone(
            phone,
            new Date(placedAt.getTime() - 24 * 60 * 60 * 1000),
          ),
          ordersFromIpLastHour:
            ipHash === null
              ? 0
              : await tx.countOrdersFromIp(ipHash, new Date(placedAt.getTime() - 60 * 60 * 1000)),
        },
        settings,
      );
      if (limit !== null) throw new Refusal(limit, { ok: false, error: "ORDER_LIMIT" });
      if (settings.duplicateWindowMinutes > 0) {
        const duplicate = await tx.findDuplicate(
          phone,
          fingerprint,
          new Date(placedAt.getTime() - settings.duplicateWindowMinutes * 60 * 1000),
        );
        if (duplicate !== null) {
          throw new Refusal("DUPLICATE", {
            ok: false,
            error: "DUPLICATE",
            orderNumber: duplicate.orderNumber,
          });
        }
      }

      // Prices once more, inside the transaction.
      const prices = await tx.variantPrices(priced.map((line) => line.key));
      if (priced.some((line) => prices.get(line.key) !== line.unitPricePoisha)) {
        throw new Refusal("PRICE_CHANGED", { ok: false, error: "QUOTE_CHANGED" });
      }

      let coupon: CouponRow | null = null;
      let couponResult: ReturnType<typeof evaluateCoupon> | null = null;
      if (code !== "") {
        coupon = await tx.lockCouponByCode(code);
        couponResult = evaluateCoupon({
          coupon: coupon === null ? null : toCouponRecord(coupon),
          lines: priced,
          now: placedAt,
          usesByPhone: coupon === null ? 0 : await tx.countCouponUsesByPhone(coupon.id, phone),
          couponOnSaleItems: settings.couponOnSaleItems,
        });
        if (!couponResult.ok) {
          throw new Refusal(`COUPON_${couponResult.reason}`, {
            ok: false,
            error: "COUPON_INVALID",
          });
        }
      }

      const { view: quote, lineDiscounts } = priceOrder({
        lines: priced,
        area,
        coupon,
        couponResult,
        settings,
      });
      if (quote.hash !== input.quoteHash) {
        throw new Refusal("QUOTE_CHANGED", { ok: false, error: "QUOTE_CHANGED" });
      }
      if (!quote.codAllowed) throw new Refusal("COD_LIMIT", { ok: false, error: "COD_LIMIT" });

      const locationId = await tx.defaultOnlineLocationId();
      if (locationId === null) throw new Error("No default online fulfilment location.");

      if (coupon !== null && !(await tx.takeCouponUse(coupon.id))) {
        throw new Refusal("COUPON_LIMIT", { ok: false, error: "COUPON_INVALID" });
      }

      const orderId = randomUUID();
      const orderNumber = formatOrderNumber(
        settings.orderNumberPrefix,
        placedAt,
        await tx.nextOrderSequence(),
      );
      const publicToken = generatePublicToken();
      const firstOrder = !(await tx.hasEarlierOrders(phone));

      await tx.createOrder({
        id: orderId,
        orderNumber,
        publicToken,
        idempotencyKey: input.idempotencyKey,
        locationId,
        customerName: input.name,
        customerPhone: phone,
        customerEmail: input.email,
        subtotalPoisha: quote.subtotalPoisha,
        discountPoisha: quote.discountPoisha,
        shippingPoisha: quote.shippingPoisha,
        totalPoisha: quote.totalPoisha,
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        zoneId: area.zone.id,
        zoneCode: area.zone.code,
        zoneName: area.zone.nameEn,
        shipLine1: input.street,
        shipLandmark: input.landmark,
        shipDivisionId: area.divisionId,
        shipDivisionName: area.divisionName.en,
        shipDistrictId: area.districtId,
        shipDistrictName: area.districtName.en,
        shipUpazilaId: area.upazilaId,
        shipUpazilaName: area.upazilaName.en,
        deliveryNote: input.note,
        placedIpHash: ipHash,
        itemsFingerprint: fingerprint,
        reviewReasons: reviewReasonsFor({
          itemCount: units,
          totalPoisha: quote.totalPoisha,
          firstOrderForPhone: firstOrder,
          reviewItemsAtLeast: settings.reviewItemsAtLeast,
          reviewFirstOrderAtLeastPoisha: settings.reviewFirstOrderAtLeastPoisha,
        }),
        items: lines.map((line) => ({
          variantId: line.variantId,
          productNameEn: line.name.en,
          productNameBn: line.name.bn ?? null,
          variantLabel: line.variantLabel,
          sku: line.sku,
          imageUrl: line.imageUrl,
          unitPricePoisha: line.unitPricePoisha,
          quantity: line.quantity,
          lineTotalPoisha: line.lineTotalPoisha,
          compareAtPoisha: line.compareAtPoisha,
          discountPoisha: lineDiscounts.get(line.variantId) ?? 0,
          sizeLabelEn: line.sizeEn,
          sizeLabelBn: line.sizeBn,
          colourLabelEn: line.colourEn,
          colourLabelBn: line.colourBn,
        })),
      });

      await applyStockMovements(
        uow,
        lines.map((line) => ({
          variantId: line.variantId,
          locationId,
          type: "RESERVE" as const,
          quantity: line.quantity,
          referenceType: "ORDER",
          referenceId: orderId,
          userId: null,
          reason: `Online order ${orderNumber}`,
        })),
      );

      await tx.deleteCart(cartId);
      return { orderNumber, publicToken, totalPoisha: quote.totalPoisha, reused: false };
    });

    if (!placed.reused) {
      await notify({
        type: "order.placed",
        orderNumber: placed.orderNumber,
        totalPoisha: placed.totalPoisha,
      });
    }
    return { ok: true, ...placed };
  } catch (error) {
    if (error instanceof Refusal) {
      const result =
        error.result.error === "QUOTE_CHANGED" || error.result.error === "COUPON_INVALID"
          ? { ...error.result, ...(await freshQuote(cartToken, input, meta, phone)) }
          : error.result;
      return reject(error.reason, result);
    }
    if (isAppError(error) && error.code === "OUT_OF_STOCK") {
      const details = (error.details?.lines ?? []) as Array<{ sku?: string }>;
      return reject("OUT_OF_STOCK", {
        ok: false,
        error: "OUT_OF_STOCK",
        skus: details.map((line) => line.sku ?? "").filter((sku) => sku !== ""),
      });
    }
    if (isUniqueViolation(error, "idempotencyKey")) {
      const same = await findOrderByIdempotencyKey(input.idempotencyKey);
      if (same !== null && same.publicToken !== null) {
        return { ok: true, ...same, publicToken: same.publicToken, reused: true };
      }
    }
    console.error("[checkout] order failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "FAILED" };
  }
}

async function freshQuote(
  cartToken: string | null,
  input: z.infer<typeof placeSchema>,
  meta: RequestMeta,
  phone: string,
): Promise<{ quote?: QuoteView }> {
  const result = await quoteCheckout(
    cartToken,
    { area: input.area, couponCode: input.couponCode },
    meta,
    phone,
  ).catch(() => null);
  return result?.ok === true ? { quote: result.quote } : {};
}

// ---------------------------------------------------------------------------
// confirmation and tracking
// ---------------------------------------------------------------------------

export interface OrderView extends Omit<OrderViewRow, "id" | "customerPhone" | "customerName"> {
  maskedPhone: string;
  customerName: string;
}

function toOrderView(row: OrderViewRow): OrderView {
  // The database id never reaches the browser.
  const { customerPhone, id: _id, ...rest } = row;
  return { ...rest, maskedPhone: maskBdMobile(customerPhone) };
}

export async function getOrderConfirmation(publicToken: string): Promise<OrderView | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(publicToken)) return null;
  const row = await findOrderByPublicToken(publicToken);
  return row === null ? null : toOrderView(row);
}

export type TrackResult =
  | {
      ok: true;
      order: Omit<OrderView, "customerName" | "shipLine1" | "shipLandmark">;
      /** Return / exchange choices when the order is eligible (Phase 9). */
      returns: CustomerReturnOptions | null;
      /** The return policy link shows only once the policy is published. */
      showReturnsPolicy: boolean;
    }
  | { ok: false; error: "NOT_FOUND" | "RATE_LIMITED" };

/**
 * Order number + the phone it was placed with. Any mismatch gets the same
 * answer, and tries per IP are limited, so numbers cannot be probed.
 */
export async function trackOrder(rawInput: unknown, meta: RequestMeta): Promise<TrackResult> {
  const settings = await getCheckoutSettings();
  const key = `track:${hashIp(meta.ip) ?? "no-ip"}`;
  if ((await reserveThrottleAttempt(key, 15 * 60)) > settings.trackAttemptsPer15Min) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const parsed = z
    .object({ orderNumber: z.string().trim().max(30), phone: z.string().max(30) })
    .safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "NOT_FOUND" };
  const phone = normalizeBdMobile(parsed.data.phone);
  if (!phone.ok) return { ok: false, error: "NOT_FOUND" };
  const row = await findOrderForTracking(parsed.data.orderNumber.toUpperCase(), phone.phone);
  if (row === null) return { ok: false, error: "NOT_FOUND" };
  // Tracking shows the area, never the street address or the name.
  const {
    customerName: _name,
    shipLine1: _line,
    shipLandmark: _landmark,
    ...order
  } = toOrderView(row);
  const [returns, showReturnsPolicy] = await Promise.all([
    getCustomerReturnOptions(row.id),
    isReturnPolicyPublished(),
  ]);
  return { ok: true, order, returns, showReturnsPolicy };
}
