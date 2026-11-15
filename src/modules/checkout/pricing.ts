/**
 * Order money — pure, in integer poisha. The browser never sends a price: the
 * server rebuilds every number from the database through these functions.
 *
 *   subtotal      = Σ unit price × quantity
 *   discount      ≤ eligible subtotal (coupon lines only)
 *   afterDiscount = subtotal − discount
 *   shipping      = 0 when a free-shipping coupon applies or
 *                   afterDiscount ≥ free-delivery threshold; else the zone rate
 *   total         = afterDiscount + shipping   (= the Order CHECK constraint)
 */
import { createHash } from "node:crypto";

import { allocateDiscount } from "./allocate";

export interface PricedLine {
  /** Stable key for the line (variant id). */
  key: string;
  unitPricePoisha: number;
  compareAtPoisha: number | null;
  quantity: number;
  productId: string;
  categoryIds: readonly string[];
}

export function lineTotal(line: Pick<PricedLine, "unitPricePoisha" | "quantity">): number {
  return line.unitPricePoisha * line.quantity;
}

/** A line is "on sale" when its compare-at price is above its price. */
export function isOnSale(line: Pick<PricedLine, "unitPricePoisha" | "compareAtPoisha">): boolean {
  return line.compareAtPoisha !== null && line.compareAtPoisha > line.unitPricePoisha;
}

export { allocateDiscount };

export interface CouponEffect {
  /** Goods discount in poisha (0 for a free-shipping coupon). */
  discountPoisha: number;
  freeShipping: boolean;
  /** Line keys the discount is spread over. */
  eligibleKeys: readonly string[];
}

export interface Quote {
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  /** Shipping before any waiver, for "free delivery" messages. */
  zoneRatePoisha: number;
  freeShipping: boolean;
  /** How much more (after discount) would make delivery free; 0 when free. */
  toFreeShippingPoisha: number;
  lineDiscounts: Map<string, number>;
}

export function buildQuote(input: {
  lines: readonly PricedLine[];
  coupon: CouponEffect | null;
  zoneRatePoisha: number;
  freeShippingThresholdPoisha: number;
}): Quote {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const eligible = input.lines.filter((line) => input.coupon?.eligibleKeys.includes(line.key));
  const eligibleTotal = eligible.reduce((sum, line) => sum + lineTotal(line), 0);
  const discount = Math.max(0, Math.min(input.coupon?.discountPoisha ?? 0, eligibleTotal));
  const afterDiscount = subtotal - discount;
  const freeByThreshold = afterDiscount >= input.freeShippingThresholdPoisha;
  const freeShipping = (input.coupon?.freeShipping ?? false) || freeByThreshold;
  const shipping = freeShipping ? 0 : input.zoneRatePoisha;
  return {
    subtotalPoisha: subtotal,
    discountPoisha: discount,
    shippingPoisha: shipping,
    totalPoisha: afterDiscount + shipping,
    zoneRatePoisha: input.zoneRatePoisha,
    freeShipping,
    toFreeShippingPoisha: freeShipping
      ? 0
      : Math.max(0, input.freeShippingThresholdPoisha - afterDiscount),
    // Every line has an entry; lines outside the coupon get 0.
    lineDiscounts: new Map([
      ...input.lines.map((line) => [line.key, 0] as const),
      ...allocateDiscount(
        discount,
        eligible.map((line) => ({ key: line.key, total: lineTotal(line) })),
      ),
    ]),
  };
}

/**
 * Fingerprint of what the customer was shown. If prices, stock-driven
 * quantities, zone or coupon change between the checkout page and the
 * submit, the hash differs and the order is refused with the new numbers.
 */
export function quoteHash(input: {
  lines: ReadonlyArray<Pick<PricedLine, "key" | "unitPricePoisha" | "quantity">>;
  quote: Pick<Quote, "subtotalPoisha" | "discountPoisha" | "shippingPoisha" | "totalPoisha">;
  zoneCode: string | null;
  couponCode: string | null;
}): string {
  const lines = [...input.lines]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((line) => `${line.key}:${line.unitPricePoisha}:${line.quantity}`)
    .join(",");
  const payload = [
    lines,
    input.quote.subtotalPoisha,
    input.quote.discountPoisha,
    input.quote.shippingPoisha,
    input.quote.totalPoisha,
    input.zoneCode ?? "",
    input.couponCode ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** Same items and quantities, in any order -> same fingerprint. */
export function itemsFingerprint(lines: ReadonlyArray<{ key: string; quantity: number }>): string {
  const payload = [...lines]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((line) => `${line.key}:${line.quantity}`)
    .join(",");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
