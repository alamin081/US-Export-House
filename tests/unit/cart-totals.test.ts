import { describe, expect, it } from "vitest";

import { SEED_DEFAULTS } from "@/config/constants";
import {
  calculateTotals,
  MOCK_CART_LINES,
  SHIPPING_RATES,
  type MockCartLine,
} from "@/modules/cart/cart.mock";

/**
 * These cover the arithmetic the Phase 8 checkout service has to reproduce on
 * the server: shipping by zone, the free-shipping threshold, and percentage
 * coupons rounded to whole poisha.
 */
const line = (overrides: Partial<MockCartLine> = {}): MockCartLine => ({
  lineId: "l1",
  productSlug: "test-shirt",
  name: { en: "Test shirt" },
  sku: "UEH-TEST-1",
  size: "M",
  colour: { en: "White" },
  quantity: 1,
  unitPricePoisha: 100_000,
  image: "/images/products/formal-shirts-1.svg",
  maxQuantity: 10,
  ...overrides,
});

describe("cart totals", () => {
  it("charges the Dhaka rate below the free-shipping threshold", () => {
    const totals = calculateTotals([line()], "inside_dhaka");

    expect(totals.subtotalPoisha).toBe(100_000);
    expect(totals.shippingPoisha).toBe(SHIPPING_RATES.inside_dhaka);
    expect(totals.freeShippingApplied).toBe(false);
    expect(totals.totalPoisha).toBe(100_000 + SHIPPING_RATES.inside_dhaka);
  });

  it("charges the higher rate outside Dhaka", () => {
    const totals = calculateTotals([line()], "outside_dhaka");
    expect(totals.shippingPoisha).toBe(SHIPPING_RATES.outside_dhaka);
    expect(SHIPPING_RATES.outside_dhaka).toBeGreaterThan(SHIPPING_RATES.inside_dhaka);
  });

  it("gives free delivery at the threshold", () => {
    const atThreshold = calculateTotals(
      [line({ unitPricePoisha: SEED_DEFAULTS.shipping.freeShippingThresholdPoisha })],
      "outside_dhaka",
    );

    expect(atThreshold.freeShippingApplied).toBe(true);
    expect(atThreshold.shippingPoisha).toBe(0);
    expect(atThreshold.remainingForFreeShippingPoisha).toBe(0);
  });

  it("reports how much more is needed for free delivery", () => {
    const totals = calculateTotals([line({ unitPricePoisha: 200_000 })], "inside_dhaka");
    expect(totals.remainingForFreeShippingPoisha).toBe(
      SEED_DEFAULTS.shipping.freeShippingThresholdPoisha - 200_000,
    );
  });

  it("applies a known coupon and ignores an unknown one", () => {
    const withCoupon = calculateTotals(
      [line({ unitPricePoisha: 200_000 })],
      "inside_dhaka",
      "welcome10",
    );
    expect(withCoupon.discountPoisha).toBe(20_000);
    expect(withCoupon.totalPoisha).toBe(180_000 + SHIPPING_RATES.inside_dhaka);

    const withNonsense = calculateTotals([line()], "inside_dhaka", "NOT-A-CODE");
    expect(withNonsense.discountPoisha).toBe(0);
  });

  it("checks free shipping against the discounted subtotal, not the gross one", () => {
    // 2,600 BDT gross is above the threshold, but 10% off drops it below.
    const totals = calculateTotals(
      [line({ unitPricePoisha: 260_000 })],
      "inside_dhaka",
      "WELCOME10",
    );

    expect(totals.discountPoisha).toBe(26_000);
    expect(totals.freeShippingApplied).toBe(false);
    expect(totals.shippingPoisha).toBe(SHIPPING_RATES.inside_dhaka);
  });

  it("charges no delivery for an empty cart", () => {
    const totals = calculateTotals([], "outside_dhaka");
    expect(totals.itemCount).toBe(0);
    expect(totals.shippingPoisha).toBe(0);
    expect(totals.totalPoisha).toBe(0);
  });

  it("counts quantities across the sample cart", () => {
    const totals = calculateTotals(MOCK_CART_LINES, "inside_dhaka");
    expect(totals.itemCount).toBe(4);
    expect(totals.subtotalPoisha).toBe(996_000);
  });
});
