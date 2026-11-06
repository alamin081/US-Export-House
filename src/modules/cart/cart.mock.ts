/**
 * ============================================================================
 * PHASE 3 MOCK CART — NOT REAL DATA
 * ============================================================================
 *
 * A pre-filled cart so the cart and checkout screens can be reviewed with
 * content in them. Quantity changes are kept in React state only; nothing is
 * persisted and no stock is reserved.
 *
 * The totals helper below mirrors the Phase 8 rule that every amount is
 * recalculated on the server from database prices and the `ShippingZone`
 * table - the browser's numbers are never trusted. The thresholds here are the
 * agreed development seed values.
 */
import { SEED_DEFAULTS } from "@/config/constants";
import type { LocalizedText } from "@/lib/content";
import { sumPoisha } from "@/lib/money";

export type ShippingZoneId = "inside_dhaka" | "outside_dhaka";

export interface MockCartLine {
  lineId: string;
  productSlug: string;
  name: LocalizedText;
  sku: string;
  size: string;
  colour: LocalizedText;
  quantity: number;
  unitPricePoisha: number;
  comparePricePoisha?: number;
  image: string;
  /** Available quantity at the fulfilling location, for the stepper's cap. */
  maxQuantity: number;
}

export const MOCK_CART_LINES: readonly MockCartLine[] = [
  {
    lineId: "line-1",
    productSlug: "classic-white-oxford-shirt",
    name: { en: "Classic White Oxford Shirt", bn: "ক্লাসিক সাদা অক্সফোর্ড শার্ট" },
    sku: "UEH-FS-1001",
    size: "L",
    colour: { en: "White", bn: "সাদা" },
    quantity: 2,
    unitPricePoisha: 249_000,
    comparePricePoisha: 299_000,
    image: "/images/products/formal-shirts-1.svg",
    maxQuantity: 8,
  },
  {
    lineId: "line-2",
    productSlug: "slim-fit-indigo-jeans",
    name: { en: "Slim Fit Indigo Jeans", bn: "স্লিম ফিট ইন্ডিগো জিন্স" },
    sku: "UEH-DJ-4001",
    size: "32",
    colour: { en: "Indigo", bn: "ইন্ডিগো" },
    quantity: 1,
    unitPricePoisha: 349_000,
    image: "/images/products/denim-jeans-1.svg",
    maxQuantity: 5,
  },
  {
    lineId: "line-3",
    productSlug: "pique-polo-charcoal",
    name: { en: "Pique Polo — Charcoal", bn: "পিকে পোলো — চারকোল" },
    sku: "UEH-PL-3001",
    size: "M",
    colour: { en: "Charcoal", bn: "চারকোল" },
    quantity: 1,
    unitPricePoisha: 149_000,
    image: "/images/products/polo-t-shirts-1.svg",
    maxQuantity: 12,
  },
];

/** Development seed rates; the business edits these from the admin in Phase 8. */
export const SHIPPING_RATES: Record<ShippingZoneId, number> = {
  inside_dhaka: SEED_DEFAULTS.shipping.insideDhakaPoisha,
  outside_dhaka: SEED_DEFAULTS.shipping.outsideDhakaPoisha,
};

export const FREE_SHIPPING_THRESHOLD_POISHA = SEED_DEFAULTS.shipping.freeShippingThresholdPoisha;

/** Sample coupons, so the discount row can be reviewed. */
export const MOCK_COUPONS: Record<string, { percentage: number; label: LocalizedText }> = {
  WELCOME10: {
    percentage: 10,
    label: { en: "Welcome offer — 10% off", bn: "ওয়েলকাম অফার — 10% ছাড়" },
  },
  EID15: {
    percentage: 15,
    label: { en: "Eid offer — 15% off", bn: "ঈদ অফার — 15% ছাড়" },
  },
};

export interface CartTotals {
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  itemCount: number;
  freeShippingApplied: boolean;
  /** How much more is needed to reach free shipping, 0 once reached. */
  remainingForFreeShippingPoisha: number;
}

export function calculateTotals(
  lines: readonly MockCartLine[],
  zone: ShippingZoneId,
  couponCode?: string,
): CartTotals {
  const subtotalPoisha = sumPoisha(lines.map((line) => line.unitPricePoisha * line.quantity));
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);

  const coupon = couponCode === undefined ? undefined : MOCK_COUPONS[couponCode.toUpperCase()];
  const discountPoisha =
    coupon === undefined ? 0 : Math.round((subtotalPoisha * coupon.percentage) / 100);

  const afterDiscount = subtotalPoisha - discountPoisha;
  const freeShippingApplied = afterDiscount >= FREE_SHIPPING_THRESHOLD_POISHA;
  const shippingPoisha = itemCount === 0 || freeShippingApplied ? 0 : SHIPPING_RATES[zone];

  return {
    subtotalPoisha,
    discountPoisha,
    shippingPoisha,
    totalPoisha: afterDiscount + shippingPoisha,
    itemCount,
    freeShippingApplied,
    remainingForFreeShippingPoisha: Math.max(0, FREE_SHIPPING_THRESHOLD_POISHA - afterDiscount),
  };
}
