import { describe, expect, it } from "vitest";

import { evaluateCoupon, type CouponRecord } from "@/modules/checkout/coupon-rules";
import { buildQuote, type PricedLine } from "@/modules/checkout/pricing";
import {
  callNeedsAttention,
  countsTowardUnreachable,
  couponForEdit,
  isUnreachable,
  mergeRequestedLines,
  planEditedLines,
  reservationDelta,
  settleCod,
} from "@/modules/orders/order-rules";
import {
  canTransition,
  holdsReservation,
  isAddressCorrectable,
  isEditable,
  TRANSITIONS,
  transitionsFrom,
  type OrderStatus,
  type OrderTransition,
} from "@/modules/orders/order-state";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "DELIVERY_FAILED",
  "RETURNED_TO_WAREHOUSE",
];

/** The approved state machine (Phase 9 plan), written out by hand. */
const ALLOWED: Record<OrderTransition, OrderStatus[]> = {
  CONFIRM: ["PENDING"],
  START_PACKING: ["CONFIRMED"],
  UNPACK: ["PROCESSING"],
  CANCEL: ["PENDING", "CONFIRMED", "PROCESSING"],
  SHIP: ["PROCESSING", "DELIVERY_FAILED"],
  DELIVER: ["SHIPPED"],
  DELIVERY_FAILED: ["SHIPPED"],
  RETURN_TO_WAREHOUSE: ["DELIVERY_FAILED"],
};

describe("order state machine", () => {
  for (const transition of Object.keys(ALLOWED) as OrderTransition[]) {
    for (const status of ALL_STATUSES) {
      const allowed = ALLOWED[transition].includes(status);
      it(`${transition} from ${status} is ${allowed ? "allowed" : "refused"}`, () => {
        expect(canTransition(status, transition)).toBe(allowed);
      });
    }
  }

  it("leads each transition to the planned status", () => {
    expect(TRANSITIONS.CONFIRM.to).toBe("CONFIRMED");
    expect(TRANSITIONS.START_PACKING.to).toBe("PROCESSING");
    expect(TRANSITIONS.UNPACK.to).toBe("CONFIRMED");
    expect(TRANSITIONS.CANCEL.to).toBe("CANCELLED");
    expect(TRANSITIONS.SHIP.to).toBe("SHIPPED");
    expect(TRANSITIONS.DELIVER.to).toBe("DELIVERED");
    expect(TRANSITIONS.DELIVERY_FAILED.to).toBe("DELIVERY_FAILED");
    expect(TRANSITIONS.RETURN_TO_WAREHOUSE.to).toBe("RETURNED_TO_WAREHOUSE");
  });

  it("guards each transition with the planned permission", () => {
    expect(TRANSITIONS.CONFIRM.permission).toBe("order.confirm");
    expect(TRANSITIONS.CANCEL.permission).toBe("order.cancel");
    for (const key of [
      "START_PACKING",
      "UNPACK",
      "SHIP",
      "DELIVER",
      "DELIVERY_FAILED",
      "RETURN_TO_WAREHOUSE",
    ] as const) {
      expect(TRANSITIONS[key].permission).toBe("order.fulfil");
    }
  });

  it("has no way out of a finished order", () => {
    for (const status of ["DELIVERED", "CANCELLED", "RETURNED", "RETURNED_TO_WAREHOUSE"] as const) {
      expect(transitionsFrom(status)).toEqual([]);
    }
  });

  it("allows edits only before packing, and reservations only until shipping", () => {
    expect(ALL_STATUSES.filter(isEditable)).toEqual(["PENDING", "CONFIRMED"]);
    expect(ALL_STATUSES.filter(holdsReservation)).toEqual(["PENDING", "CONFIRMED", "PROCESSING"]);
    expect(isAddressCorrectable("SHIPPED")).toBe(true);
    expect(isAddressCorrectable("DELIVERED")).toBe(false);
  });
});

describe("confirmation calls", () => {
  const settings = { unreachableAfterAttempts: 3, callRetryMinHours: 2 };
  const at = (hours: number) => new Date(Date.UTC(2026, 10, 16, 4) + hours * 3_600_000);

  it("counts only unanswered calls at least two hours apart", () => {
    expect(
      countsTowardUnreachable({ outcome: "NO_ANSWER", at: at(0), lastCountedAt: null, settings }),
    ).toBe(true);
    expect(
      countsTowardUnreachable({ outcome: "NO_ANSWER", at: at(1), lastCountedAt: at(0), settings }),
    ).toBe(false);
    expect(
      countsTowardUnreachable({
        outcome: "SWITCHED_OFF",
        at: at(2),
        lastCountedAt: at(0),
        settings,
      }),
    ).toBe(true);
    for (const outcome of [
      "CONFIRMED",
      "WRONG_NUMBER",
      "CALL_BACK_LATER",
      "CANCEL_REQUESTED",
    ] as const) {
      expect(countsTowardUnreachable({ outcome, at: at(5), lastCountedAt: null, settings })).toBe(
        false,
      );
    }
  });

  it("flags unreachable at the threshold and points out urgent outcomes", () => {
    expect(isUnreachable(2, settings)).toBe(false);
    expect(isUnreachable(3, settings)).toBe(true);
    expect(callNeedsAttention("WRONG_NUMBER")).toBe(true);
    expect(callNeedsAttention("CANCEL_REQUESTED")).toBe(true);
    expect(callNeedsAttention("NO_ANSWER")).toBe(false);
  });
});

describe("editing lines", () => {
  const existing = [
    { variantId: "shirt-m", unitPricePoisha: 150_000, quantity: 2 },
    { variantId: "pant-32", unitPricePoisha: 200_000, quantity: 1 },
  ];
  const currentPrices = new Map([
    ["shirt-m", 160_000],
    ["shirt-l", 160_000],
    ["pant-32", 210_000],
  ]);

  it("keeps the order-time price for existing variants and uses today's for new ones", () => {
    const planned = planEditedLines({
      existing,
      requested: [
        { variantId: "shirt-m", quantity: 1 },
        { variantId: "shirt-l", quantity: 1 },
        { variantId: "pant-32", quantity: 1 },
      ],
      currentPrices,
    });
    expect(planned).toEqual({
      ok: true,
      lines: [
        { variantId: "shirt-m", quantity: 1, unitPricePoisha: 150_000, priceSource: "KEPT" },
        { variantId: "shirt-l", quantity: 1, unitPricePoisha: 160_000, priceSource: "CURRENT" },
        { variantId: "pant-32", quantity: 1, unitPricePoisha: 200_000, priceSource: "KEPT" },
      ],
    });
  });

  it("refuses a new variant that has no current price (not for sale)", () => {
    expect(
      planEditedLines({ existing, requested: [{ variantId: "gone", quantity: 1 }], currentPrices }),
    ).toEqual({ ok: false, missing: ["gone"] });
  });

  it("merges duplicate lines and drops zero quantities", () => {
    expect(
      mergeRequestedLines([
        { variantId: "a", quantity: 1 },
        { variantId: "b", quantity: 0 },
        { variantId: "a", quantity: 2 },
      ]),
    ).toEqual([
      { variantId: "a", quantity: 3 },
      { variantId: "b", quantity: 0 },
    ]);
  });

  it("reserves and releases only the difference", () => {
    // Size swap M -> L for one shirt, pant unchanged.
    expect(
      reservationDelta(existing, [
        { variantId: "shirt-m", quantity: 1 },
        { variantId: "shirt-l", quantity: 1 },
        { variantId: "pant-32", quantity: 1 },
      ]),
    ).toEqual([
      { variantId: "shirt-m", quantity: -1 },
      { variantId: "shirt-l", quantity: 1 },
    ]);
    expect(reservationDelta(existing, existing as never)).toEqual([]);
  });
});

describe("coupon after an edit", () => {
  const coupon: CouponRecord = {
    code: "TEN",
    type: "PERCENTAGE",
    value: 10,
    channel: "ONLINE",
    minSubtotalPoisha: 300_000,
    maxDiscountPoisha: null,
    startsAt: new Date("2026-11-01T00:00:00Z"),
    endsAt: new Date("2026-11-10T00:00:00Z"),
    usageLimit: 1,
    usageLimitPerCustomer: 1,
    usedCount: 1,
    isActive: false,
    deletedAt: null,
    scopes: [],
  };
  const line = (key: string, price: number, quantity: number): PricedLine => ({
    key,
    unitPricePoisha: price,
    compareAtPoisha: null,
    quantity,
    productId: key,
    categoryIds: [],
  });
  const placedAt = new Date("2026-11-05T00:00:00Z");

  it("ignores usage limits, the active flag and today's date (judged at placement)", () => {
    const result = evaluateCoupon({
      coupon: couponForEdit(coupon),
      lines: [line("a", 200_000, 2)],
      now: placedAt,
      usesByPhone: 0,
      couponOnSaleItems: false,
    });
    expect(result).toEqual({
      ok: true,
      effect: { discountPoisha: 40_000, freeShipping: false, eligibleKeys: ["a"] },
    });
  });

  it("drops the coupon when the edited basket is under the minimum", () => {
    const result = evaluateCoupon({
      coupon: couponForEdit(coupon),
      lines: [line("a", 200_000, 1)],
      now: placedAt,
      usesByPhone: 0,
      couponOnSaleItems: false,
    });
    expect(result).toMatchObject({ ok: false, reason: "MIN_SUBTOTAL" });
  });

  it("recalculates totals, delivery and the line shares", () => {
    const lines = [line("shirt", 150_000, 2), line("pant", 200_000, 1)];
    const quote = buildQuote({
      lines,
      coupon: { discountPoisha: 50_000, freeShipping: false, eligibleKeys: ["shirt", "pant"] },
      zoneRatePoisha: 7_000,
      freeShippingThresholdPoisha: 1_000_000,
    });
    expect(quote.totalPoisha).toBe(457_000);
    expect(quote.lineDiscounts.get("shirt")).toBe(30_000);
    expect(quote.lineDiscounts.get("pant")).toBe(20_000);
  });
});

describe("courier cash settlement", () => {
  it("marks fully paid orders and keeps the mismatch", () => {
    const result = settleCod({
      lines: [
        { orderId: "a", expectedPoisha: 100_000, receivedPoisha: 100_000 },
        { orderId: "b", expectedPoisha: 50_000, receivedPoisha: 40_000 },
      ],
      receivedPoisha: 130_000,
      courierChargePoisha: 10_000,
    });
    expect(result).toEqual({
      ok: true,
      result: {
        expectedPoisha: 150_000,
        differencePoisha: -10_000,
        paidOrderIds: ["a"],
        shortOrderIds: ["b"],
      },
    });
  });

  it("matches exactly when the courier's charge explains the gap", () => {
    const result = settleCod({
      lines: [{ orderId: "a", expectedPoisha: 100_000, receivedPoisha: 100_000 }],
      receivedPoisha: 93_000,
      courierChargePoisha: 7_000,
    });
    expect(result.ok && result.result.differencePoisha).toBe(0);
  });

  it("refuses empty, negative, duplicate and over-paid lines", () => {
    expect(settleCod({ lines: [], receivedPoisha: 0, courierChargePoisha: 0 })).toEqual({
      ok: false,
      problem: "EMPTY",
    });
    expect(
      settleCod({
        lines: [{ orderId: "a", expectedPoisha: 100, receivedPoisha: 101 }],
        receivedPoisha: 101,
        courierChargePoisha: 0,
      }),
    ).toEqual({ ok: false, problem: "ABOVE_EXPECTED" });
    expect(
      settleCod({
        lines: [
          { orderId: "a", expectedPoisha: 100, receivedPoisha: 100 },
          { orderId: "a", expectedPoisha: 100, receivedPoisha: 100 },
        ],
        receivedPoisha: 200,
        courierChargePoisha: 0,
      }),
    ).toEqual({ ok: false, problem: "DUPLICATE_ORDER" });
    expect(
      settleCod({
        lines: [{ orderId: "a", expectedPoisha: 100, receivedPoisha: 100 }],
        receivedPoisha: -1,
        courierChargePoisha: 0,
      }),
    ).toEqual({ ok: false, problem: "NEGATIVE" });
  });
});
