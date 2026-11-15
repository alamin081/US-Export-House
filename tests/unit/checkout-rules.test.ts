import { describe, expect, it } from "vitest";

import { SYSTEM_ROLES } from "@/modules/access/permissions";
import {
  checkCartLimits,
  checkOrderRateLimits,
  formatOrderNumber,
  resolveZone,
  reviewReasons,
} from "@/modules/checkout/checkout-rules";
import {
  evaluateCoupon,
  normalizeCouponCode,
  type CouponRecord,
} from "@/modules/checkout/coupon-rules";
import { formatBdMobile, maskBdMobile, normalizeBdMobile } from "@/modules/checkout/phone";
import {
  allocateDiscount,
  buildQuote,
  isOnSale,
  itemsFingerprint,
  quoteHash,
  type PricedLine,
} from "@/modules/checkout/pricing";
import {
  DEFAULT_CHECKOUT_SETTINGS,
  parseCheckoutSettings,
} from "@/modules/settings/checkout-settings";

const line = (
  key: string,
  price: number,
  quantity: number,
  extra: Partial<PricedLine> = {},
): PricedLine => ({
  key,
  unitPricePoisha: price,
  compareAtPoisha: null,
  quantity,
  productId: `p-${key}`,
  categoryIds: ["shirts"],
  ...extra,
});

const coupon = (overrides: Partial<CouponRecord> = {}): CouponRecord => ({
  code: "SAVE10",
  type: "PERCENTAGE",
  value: 10,
  channel: "ONLINE",
  minSubtotalPoisha: null,
  maxDiscountPoisha: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageLimitPerCustomer: null,
  usedCount: 0,
  isActive: true,
  deletedAt: null,
  scopes: [],
  ...overrides,
});

const NOW = new Date("2026-11-15T06:00:00Z");

describe("Bangladeshi mobile numbers", () => {
  it.each([
    ["01712345678", "+8801712345678"],
    ["01712-345678", "+8801712345678"],
    ["+880 1712 345678", "+8801712345678"],
    ["8801712345678", "+8801712345678"],
    ["008801712345678", "+8801712345678"],
    ["(017) 1234-5678", "+8801712345678"],
    ["০১৭১২৩৪৫৬৭৮", "+8801712345678"],
    ["+৮৮০১৩১২৩৪৫৬৭৮", "+8801312345678"],
    ["1912345678", "+8801912345678"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeBdMobile(input)).toEqual({ ok: true, phone: expected });
  });

  it.each([
    "",
    "0171234567",
    "017123456789",
    "01212345678",
    "01112345678",
    "02-9123456",
    "+447700900123",
    "01712abc678",
    "abc",
  ])("refuses %s", (input) => {
    expect(normalizeBdMobile(input)).toEqual({ ok: false });
  });

  it("formats and masks for staff", () => {
    expect(formatBdMobile("+8801712345678")).toBe("01712-345678");
    expect(maskBdMobile("+8801712345678")).toBe("01***-***678");
  });
});

describe("totals", () => {
  const settings = { zoneRatePoisha: 7_000, freeShippingThresholdPoisha: 250_000 };

  it("worked example from the plan: 10% capped at ৳250, sale line excluded, free delivery", () => {
    const lines = [
      line("shirt", 150_000, 2),
      line("polo", 90_000, 1, { compareAtPoisha: 120_000 }),
    ];
    const result = evaluateCoupon({
      coupon: coupon({ maxDiscountPoisha: 25_000 }),
      lines,
      now: NOW,
      usesByPhone: 0,
      couponOnSaleItems: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const quote = buildQuote({ lines, coupon: result.effect, ...settings });
    expect(quote).toMatchObject({
      subtotalPoisha: 390_000,
      discountPoisha: 25_000,
      shippingPoisha: 0,
      totalPoisha: 365_000,
    });
    expect(quote.lineDiscounts.get("shirt")).toBe(25_000);
    expect(quote.lineDiscounts.get("polo")).toBe(0);
  });

  it("free delivery exactly at ৳2,500 after the discount, not one poisha below", () => {
    const at = buildQuote({ lines: [line("a", 250_000, 1)], coupon: null, ...settings });
    expect(at).toMatchObject({ shippingPoisha: 0, totalPoisha: 250_000, toFreeShippingPoisha: 0 });
    const below = buildQuote({ lines: [line("a", 249_999, 1)], coupon: null, ...settings });
    expect(below).toMatchObject({
      shippingPoisha: 7_000,
      totalPoisha: 256_999,
      toFreeShippingPoisha: 1,
    });
    // A discount that drops the subtotal below the threshold brings the charge back.
    const discounted = buildQuote({
      lines: [line("a", 260_000, 1)],
      coupon: { discountPoisha: 20_000, freeShipping: false, eligibleKeys: ["a"] },
      ...settings,
    });
    expect(discounted).toMatchObject({
      discountPoisha: 20_000,
      shippingPoisha: 7_000,
      totalPoisha: 247_000,
    });
  });

  it("fixed discount never exceeds the eligible subtotal; total = subtotal − discount + shipping", () => {
    const lines = [line("a", 50_000, 1)];
    const result = evaluateCoupon({
      coupon: coupon({ type: "FIXED", value: 80_000 }),
      lines,
      now: NOW,
      usesByPhone: 0,
      couponOnSaleItems: false,
    });
    if (!result.ok) throw new Error("expected ok");
    const quote = buildQuote({ lines, coupon: result.effect, ...settings });
    expect(quote.discountPoisha).toBe(50_000);
    expect(quote.totalPoisha).toBe(
      quote.subtotalPoisha - quote.discountPoisha + quote.shippingPoisha,
    );
  });

  it("free-shipping coupon waives the charge without a goods discount", () => {
    const lines = [line("a", 50_000, 1)];
    const result = evaluateCoupon({
      coupon: coupon({ type: "FREE_SHIPPING", value: 0 }),
      lines,
      now: NOW,
      usesByPhone: 0,
      couponOnSaleItems: false,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(buildQuote({ lines, coupon: result.effect, ...settings })).toMatchObject({
      discountPoisha: 0,
      shippingPoisha: 0,
      totalPoisha: 50_000,
    });
  });

  it("detects sale lines by compare-at price", () => {
    expect(isOnSale({ unitPricePoisha: 100, compareAtPoisha: 120 })).toBe(true);
    expect(isOnSale({ unitPricePoisha: 100, compareAtPoisha: 100 })).toBe(false);
    expect(isOnSale({ unitPricePoisha: 100, compareAtPoisha: null })).toBe(false);
  });
});

describe("discount allocation", () => {
  it("splits in proportion and the shares always add up exactly", () => {
    const shares = allocateDiscount(1_000, [
      { key: "a", total: 3_333 },
      { key: "b", total: 3_333 },
      { key: "c", total: 3_334 },
    ]);
    expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(1_000);
    expect(shares.get("c")).toBe(334);
  });

  it("gives leftover poisha to the largest fractions, ties to the earlier line", () => {
    const shares = allocateDiscount(1, [
      { key: "a", total: 100 },
      { key: "b", total: 100 },
    ]);
    expect(shares.get("a")).toBe(1);
    expect(shares.get("b")).toBe(0);
  });

  it("holds for many random carts", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    for (let run = 0; run < 500; run += 1) {
      const lines = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, index) => ({
        key: `k${index}`,
        total: 1 + Math.floor(random() * 500_000),
      }));
      const base = lines.reduce((sum, item) => sum + item.total, 0);
      const discount = Math.floor(random() * base);
      const shares = allocateDiscount(discount, lines);
      expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(discount);
      for (const item of lines) {
        expect(shares.get(item.key) ?? 0).toBeLessThanOrEqual(item.total);
        expect(shares.get(item.key) ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("coupon conditions", () => {
  const lines = [line("a", 100_000, 1), line("b", 50_000, 1, { categoryIds: ["polos"] })];
  const run = (
    overrides: Partial<CouponRecord>,
    extra: { usesByPhone?: number; now?: Date; onSale?: boolean; withLines?: PricedLine[] } = {},
  ) =>
    evaluateCoupon({
      coupon: coupon(overrides),
      lines: extra.withLines ?? lines,
      now: extra.now ?? NOW,
      usesByPhone: extra.usesByPhone ?? 0,
      couponOnSaleItems: extra.onSale ?? false,
    });

  it("normalises codes", () => {
    expect(normalizeCouponCode(" welcome 10 ")).toBe("WELCOME10");
  });

  it("refuses unknown, inactive, deleted, store-only and not-yet-started coupons as INVALID", () => {
    expect(
      evaluateCoupon({ coupon: null, lines, now: NOW, usesByPhone: 0, couponOnSaleItems: false }),
    ).toMatchObject({ ok: false, reason: "INVALID" });
    expect(run({ isActive: false })).toMatchObject({ reason: "INVALID" });
    expect(run({ deletedAt: new Date() })).toMatchObject({ reason: "INVALID" });
    expect(run({ channel: "STORE" })).toMatchObject({ reason: "INVALID" });
    expect(run({ startsAt: new Date("2026-12-01T00:00:00Z") })).toMatchObject({
      reason: "INVALID",
    });
  });

  it("reports expiry", () => {
    expect(run({ endsAt: new Date("2026-11-14T00:00:00Z") })).toMatchObject({ reason: "EXPIRED" });
  });

  it("hides usage limits behind INVALID (no hint that the code exists)", () => {
    expect(run({ usageLimit: 5, usedCount: 5 })).toMatchObject({ reason: "INVALID" });
    expect(run({ usageLimitPerCustomer: 1 }, { usesByPhone: 1 })).toMatchObject({
      reason: "INVALID",
    });
    expect(run({ usageLimitPerCustomer: 2 }, { usesByPhone: 1 }).ok).toBe(true);
  });

  it("measures the minimum on eligible items only", () => {
    const scoped = { scopes: [{ mode: "INCLUDE" as const, categoryId: "polos", productId: null }] };
    // Cart ৳1,500 but only the ৳500 polo is eligible.
    expect(run({ ...scoped, minSubtotalPoisha: 100_000 })).toMatchObject({
      reason: "MIN_SUBTOTAL",
      minPoisha: 100_000,
    });
    expect(run({ ...scoped, minSubtotalPoisha: 50_000 }).ok).toBe(true);
  });

  it("applies include and exclude scopes", () => {
    const include = run({ scopes: [{ mode: "INCLUDE", categoryId: "polos", productId: null }] });
    expect(include.ok && include.effect.eligibleKeys).toEqual(["b"]);
    const exclude = run({ scopes: [{ mode: "EXCLUDE", categoryId: null, productId: "p-a" }] });
    expect(exclude.ok && exclude.effect.eligibleKeys).toEqual(["b"]);
    expect(
      run({ scopes: [{ mode: "INCLUDE", categoryId: "jeans", productId: null }] }),
    ).toMatchObject({ reason: "NOT_APPLICABLE" });
  });

  it("skips sale items unless the setting allows them", () => {
    const sale = [line("s", 90_000, 1, { compareAtPoisha: 120_000 })];
    expect(run({}, { withLines: sale })).toMatchObject({ reason: "NOT_APPLICABLE" });
    expect(run({}, { withLines: sale, onSale: true }).ok).toBe(true);
  });

  it("caps percentage discounts", () => {
    const result = run({ value: 50, maxDiscountPoisha: 10_000 });
    expect(result.ok && result.effect.discountPoisha).toBe(10_000);
  });
});

describe("zone lookup", () => {
  const zones = [
    { id: "city", code: "inside_dhaka", isActive: true, isDefault: false },
    { id: "around", code: "dhaka_suburbs", isActive: true, isDefault: false },
    { id: "outside", code: "outside_dhaka", isActive: true, isDefault: true },
  ];
  it("uses the upazila first, then the district, then the fallback", () => {
    expect(resolveZone({ upazilaZoneId: "around", districtZoneId: "city", zones })?.code).toBe(
      "dhaka_suburbs",
    );
    expect(resolveZone({ upazilaZoneId: null, districtZoneId: "city", zones })?.code).toBe(
      "inside_dhaka",
    );
    expect(resolveZone({ upazilaZoneId: null, districtZoneId: null, zones })?.code).toBe(
      "outside_dhaka",
    );
  });
  it("skips an inactive zone", () => {
    const withInactive = zones.map((zone) =>
      zone.id === "around" ? { ...zone, isActive: false } : zone,
    );
    expect(
      resolveZone({ upazilaZoneId: "around", districtZoneId: null, zones: withInactive })?.code,
    ).toBe("outside_dhaka");
  });
});

describe("order numbers and limits", () => {
  it("uses the Bangladesh month and five digits", () => {
    expect(formatOrderNumber("UEH", new Date("2026-11-15T06:00:00Z"), 42)).toBe("UEH-2611-00042");
    // 30 Nov 20:00 UTC is already 1 Dec in Dhaka (UTC+6).
    expect(formatOrderNumber("UEH", new Date("2026-11-30T20:00:00Z"), 1)).toBe("UEH-2612-00001");
    expect(formatOrderNumber("UEH", new Date("2026-11-15T06:00:00Z"), 123_456)).toBe(
      "UEH-2611-123456",
    );
  });

  it("enforces cart limits", () => {
    const limits = { maxQtyPerVariant: 5, maxItemsPerOrder: 20 };
    expect(checkCartLimits([5, 5, 5, 5], limits)).toBeNull();
    expect(checkCartLimits([6], limits)).toEqual({ problem: "PER_VARIANT", max: 5 });
    expect(checkCartLimits([5, 5, 5, 5, 1], limits)).toEqual({ problem: "PER_ORDER", max: 20 });
  });

  it("applies the phone and IP limits", () => {
    const limits = { maxOpenOrdersPerPhone: 3, maxOrdersPerIpPerHour: 20 };
    expect(
      checkOrderRateLimits({ openOrdersForPhone: 2, ordersFromIpLastHour: 19 }, limits),
    ).toBeNull();
    expect(checkOrderRateLimits({ openOrdersForPhone: 3, ordersFromIpLastHour: 0 }, limits)).toBe(
      "PHONE_OPEN_ORDERS",
    );
    expect(checkOrderRateLimits({ openOrdersForPhone: 0, ordersFromIpLastHour: 20 }, limits)).toBe(
      "IP_ORDERS",
    );
  });

  it("flags orders for review", () => {
    const base = { reviewItemsAtLeast: 10, reviewFirstOrderAtLeastPoisha: 1_000_000 };
    expect(
      reviewReasons({ ...base, itemCount: 10, totalPoisha: 100, firstOrderForPhone: false }),
    ).toEqual(["LARGE_QUANTITY"]);
    expect(
      reviewReasons({ ...base, itemCount: 1, totalPoisha: 1_000_000, firstOrderForPhone: true }),
    ).toEqual(["FIRST_ORDER_HIGH_VALUE"]);
    expect(
      reviewReasons({ ...base, itemCount: 1, totalPoisha: 1_000_000, firstOrderForPhone: false }),
    ).toEqual([]);
  });

  it("fingerprints ignore line order; quote hash changes with any price", () => {
    expect(
      itemsFingerprint([
        { key: "a", quantity: 1 },
        { key: "b", quantity: 2 },
      ]),
    ).toBe(
      itemsFingerprint([
        { key: "b", quantity: 2 },
        { key: "a", quantity: 1 },
      ]),
    );
    const base = {
      lines: [{ key: "a", unitPricePoisha: 100, quantity: 1 }],
      quote: { subtotalPoisha: 100, discountPoisha: 0, shippingPoisha: 7_000, totalPoisha: 7_100 },
      zoneCode: "inside_dhaka",
      couponCode: null,
    };
    expect(quoteHash(base)).toBe(quoteHash({ ...base }));
    expect(quoteHash(base)).not.toBe(
      quoteHash({ ...base, lines: [{ key: "a", unitPricePoisha: 101, quantity: 1 }] }),
    );
  });
});

describe("checkout settings and roles", () => {
  it("defaults, the IP limit of 20 included, and falls back on bad rows", () => {
    expect(DEFAULT_CHECKOUT_SETTINGS.maxOrdersPerIpPerHour).toBe(20);
    const parsed = parseCheckoutSettings(
      new Map([
        ["checkout.maxQtyPerVariant", "7"],
        ["checkout.minFillSeconds", "-1"],
      ]),
    );
    expect(parsed.maxQtyPerVariant).toBe(7);
    expect(parsed.minFillSeconds).toBe(3);
  });

  it("gives checkout permissions to managers, and only blocking to Order Staff", () => {
    const has = (name: string, key: string) =>
      SYSTEM_ROLES.find((role) => role.name === name)?.permissions.includes(key as never) ?? false;
    for (const key of ["coupon.manage", "shipping.manage", "checkout.settings", "customer.block"]) {
      expect(has("Store Manager", key)).toBe(true);
    }
    expect(has("Order Staff", "customer.block")).toBe(true);
    expect(has("Order Staff", "coupon.manage")).toBe(false);
    expect(has("Branch Sales Staff", "customer.block")).toBe(false);
  });
});
