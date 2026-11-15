/**
 * Coupon rules — pure. The service loads the coupon and the facts; this
 * decides. Customer-facing failures are deliberately coarse ("invalid",
 * "expired", "minimum", "not applicable") so the messages never reveal which
 * codes exist or how often they were used.
 */
import { isOnSale, lineTotal, type CouponEffect, type PricedLine } from "./pricing";

export type CouponFailure =
  | { reason: "INVALID" }
  | { reason: "EXPIRED" }
  | { reason: "MIN_SUBTOTAL"; minPoisha: number }
  | { reason: "NOT_APPLICABLE" };

export interface CouponRecord {
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: number;
  channel: "ONLINE" | "STORE" | "BOTH";
  minSubtotalPoisha: number | null;
  maxDiscountPoisha: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  isActive: boolean;
  deletedAt: Date | null;
  scopes: ReadonlyArray<{
    mode: "INCLUDE" | "EXCLUDE";
    categoryId: string | null;
    productId: string | null;
  }>;
}

/** Codes match without case or spaces: " welcome 10 " = "WELCOME10". */
export function normalizeCouponCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function inScope(coupon: CouponRecord, line: PricedLine): boolean {
  const matches = (scope: CouponRecord["scopes"][number]) =>
    (scope.productId !== null && scope.productId === line.productId) ||
    (scope.categoryId !== null && line.categoryIds.includes(scope.categoryId));
  if (coupon.scopes.some((scope) => scope.mode === "EXCLUDE" && matches(scope))) return false;
  const includes = coupon.scopes.filter((scope) => scope.mode === "INCLUDE");
  return includes.length === 0 || includes.some(matches);
}

export function evaluateCoupon(input: {
  coupon: CouponRecord | null;
  lines: readonly PricedLine[];
  now: Date;
  /** Orders by this phone that already used the coupon (cancelled ones excluded). */
  usesByPhone: number;
  couponOnSaleItems: boolean;
}): { ok: true; effect: CouponEffect } | ({ ok: false } & CouponFailure) {
  const { coupon } = input;
  if (
    coupon === null ||
    !coupon.isActive ||
    coupon.deletedAt !== null ||
    coupon.channel === "STORE"
  ) {
    return { ok: false, reason: "INVALID" };
  }
  if (coupon.startsAt !== null && input.now < coupon.startsAt)
    return { ok: false, reason: "INVALID" };
  if (coupon.endsAt !== null && input.now > coupon.endsAt) return { ok: false, reason: "EXPIRED" };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "INVALID" };
  }
  if (coupon.usageLimitPerCustomer !== null && input.usesByPhone >= coupon.usageLimitPerCustomer) {
    return { ok: false, reason: "INVALID" };
  }

  const eligible = input.lines.filter(
    (line) => inScope(coupon, line) && (input.couponOnSaleItems || !isOnSale(line)),
  );
  if (eligible.length === 0) return { ok: false, reason: "NOT_APPLICABLE" };
  // The minimum is measured on eligible items only (owner decision 2026-11-15).
  const eligibleTotal = eligible.reduce((sum, line) => sum + lineTotal(line), 0);
  if (coupon.minSubtotalPoisha !== null && eligibleTotal < coupon.minSubtotalPoisha) {
    return { ok: false, reason: "MIN_SUBTOTAL", minPoisha: coupon.minSubtotalPoisha };
  }

  let discount = 0;
  if (coupon.type === "PERCENTAGE") discount = Math.floor((eligibleTotal * coupon.value) / 100);
  if (coupon.type === "FIXED") discount = coupon.value;
  if (coupon.maxDiscountPoisha !== null) discount = Math.min(discount, coupon.maxDiscountPoisha);
  discount = Math.max(0, Math.min(discount, eligibleTotal));

  return {
    ok: true,
    effect: {
      discountPoisha: discount,
      freeShipping: coupon.type === "FREE_SHIPPING",
      eligibleKeys: eligible.map((line) => line.key),
    },
  };
}
