import { describe, expect, it } from "vitest";

import {
  canStep,
  isShopFault,
  isWithinWindow,
  needsApproval,
  paymentStatusAfterRefund,
  planExchange,
  planRefund,
  returnableQuantity,
  unitsCredit,
} from "@/modules/returns/return-rules";

// The plan's example: shirt ৳1,500 × 2 with ৳300 discount; pant ৳2,000 × 1 with ৳200.
const shirt = { lineTotalPoisha: 300_000, discountPoisha: 30_000, quantity: 2 };
const pant = { lineTotalPoisha: 200_000, discountPoisha: 20_000, quantity: 1 };

describe("unit credit", () => {
  it("values returned units net of their share of the discount", () => {
    expect(unitsCredit(shirt, 0, 1)).toBe(135_000);
    expect(unitsCredit(pant, 0, 1)).toBe(180_000);
  });

  it("adds up to exactly the line's net value however it is split", () => {
    const odd = { lineTotalPoisha: 100_000, discountPoisha: 3_333, quantity: 3 };
    const oneByOne = unitsCredit(odd, 0, 1) + unitsCredit(odd, 1, 1) + unitsCredit(odd, 2, 1);
    expect(oneByOne).toBe(96_667);
    expect(unitsCredit(odd, 0, 3)).toBe(96_667);
    expect(unitsCredit(odd, 0, 2) + unitsCredit(odd, 2, 1)).toBe(96_667);
  });

  it("refuses more units than the line has", () => {
    expect(() => unitsCredit(shirt, 1, 2)).toThrow();
    expect(unitsCredit(shirt, 0, 0)).toBe(0);
    expect(returnableQuantity(2, 1)).toBe(1);
    expect(returnableQuantity(2, 3)).toBe(0);
  });
});

describe("refund", () => {
  const base = {
    orderShippingPoisha: 7_000,
    shippingAlreadyRefunded: false,
    refundShippingOnFault: true,
    refundablePoisha: 457_000,
  };

  it("does not refund delivery when the size did not fit", () => {
    expect(planRefund({ ...base, acceptedCredits: [135_000], reason: "SIZE_MISMATCH" })).toEqual({
      ok: true,
      plan: { itemsPoisha: 135_000, shippingPoisha: 0, totalPoisha: 135_000 },
    });
  });

  it("refunds delivery once for a defective or wrong item", () => {
    expect(planRefund({ ...base, acceptedCredits: [180_000], reason: "DEFECTIVE" })).toEqual({
      ok: true,
      plan: { itemsPoisha: 180_000, shippingPoisha: 7_000, totalPoisha: 187_000 },
    });
    expect(
      planRefund({
        ...base,
        acceptedCredits: [180_000],
        reason: "WRONG_ITEM",
        shippingAlreadyRefunded: true,
      }),
    ).toMatchObject({ ok: true, plan: { shippingPoisha: 0 } });
    expect(
      planRefund({
        ...base,
        acceptedCredits: [180_000],
        reason: "DEFECTIVE",
        refundShippingOnFault: false,
      }),
    ).toMatchObject({ ok: true, plan: { shippingPoisha: 0 } });
  });

  it("never refunds more than was collected, nor nothing", () => {
    expect(
      planRefund({
        ...base,
        acceptedCredits: [180_000],
        reason: "OTHER",
        refundablePoisha: 100_000,
      }),
    ).toEqual({ ok: false, problem: "ABOVE_PAID" });
    expect(planRefund({ ...base, acceptedCredits: [], reason: "OTHER" })).toEqual({
      ok: false,
      problem: "NOTHING",
    });
  });

  it("asks for approval above the limit unless the recorder may approve", () => {
    expect(
      needsApproval({
        amountPoisha: 500_001,
        approvalAbovePoisha: 500_000,
        recorderCanApprove: false,
      }),
    ).toBe(true);
    expect(
      needsApproval({
        amountPoisha: 500_000,
        approvalAbovePoisha: 500_000,
        recorderCanApprove: false,
      }),
    ).toBe(false);
    expect(
      needsApproval({
        amountPoisha: 900_000,
        approvalAbovePoisha: 500_000,
        recorderCanApprove: true,
      }),
    ).toBe(false);
  });

  it("moves the payment to partially refunded, then refunded", () => {
    expect(paymentStatusAfterRefund(457_000, 135_000)).toBe("PARTIALLY_REFUNDED");
    expect(paymentStatusAfterRefund(457_000, 457_000)).toBe("REFUNDED");
    expect(paymentStatusAfterRefund(457_000, 0)).toBe("PAID");
  });
});

describe("exchange", () => {
  const sizeSwap = {
    quantity: 1,
    creditPoisha: 135_000,
    originalProductId: "shirt",
    originalUnitPricePoisha: 150_000,
    replacement: { variantId: "shirt-l", productId: "shirt", currentPricePoisha: 160_000 },
  };

  it("swaps a size for nothing but the delivery (customer pays delivery)", () => {
    const plan = planExchange({
      lines: [sizeSwap],
      reason: "SIZE_MISMATCH",
      zoneRatePoisha: 7_000,
      exchangeShippingPaidBy: "CUSTOMER",
    });
    expect(plan).toMatchObject({
      subtotalPoisha: 150_000,
      discountPoisha: 15_000,
      shippingPoisha: 7_000,
      totalPoisha: 142_000,
      creditUsedPoisha: 135_000,
      creditLeftPoisha: 0,
      toPayPoisha: 7_000,
    });
  });

  it("charges the difference for a dearer product; the shop pays delivery on its fault", () => {
    const plan = planExchange({
      lines: [
        {
          ...sizeSwap,
          replacement: { variantId: "other", productId: "other", currentPricePoisha: 180_000 },
        },
      ],
      reason: "DEFECTIVE",
      zoneRatePoisha: 7_000,
      exchangeShippingPaidBy: "CUSTOMER",
    });
    expect(plan).toMatchObject({ shippingPoisha: 0, totalPoisha: 180_000, toPayPoisha: 45_000 });
  });

  it("refunds what is left when the new product is cheaper", () => {
    const plan = planExchange({
      lines: [
        {
          ...sizeSwap,
          replacement: { variantId: "cheap", productId: "cheap", currentPricePoisha: 100_000 },
        },
      ],
      reason: "CHANGED_MIND",
      zoneRatePoisha: 7_000,
      exchangeShippingPaidBy: "SHOP",
    });
    expect(plan).toMatchObject({
      totalPoisha: 100_000,
      creditUsedPoisha: 100_000,
      creditLeftPoisha: 35_000,
      toPayPoisha: 0,
    });
  });
});

describe("return steps and window", () => {
  it("follows REQUESTED → APPROVED → RECEIVED → INSPECTED → COMPLETED", () => {
    expect(canStep("REQUESTED", "APPROVE")).toBe(true);
    expect(canStep("REQUESTED", "REJECT")).toBe(true);
    expect(canStep("APPROVED", "REJECT")).toBe(false);
    expect(canStep("APPROVED", "RECEIVE")).toBe(true);
    expect(canStep("RECEIVED", "INSPECT")).toBe(true);
    expect(canStep("INSPECTED", "CLOSE")).toBe(true);
    expect(canStep("COMPLETED", "CLOSE")).toBe(false);
    expect(canStep("REQUESTED", "INSPECT")).toBe(false);
  });

  it("allows requests up to the end of the window", () => {
    const delivered = new Date("2026-11-01T10:00:00Z");
    expect(isWithinWindow(delivered, new Date("2026-11-08T10:00:00Z"), 7)).toBe(true);
    expect(isWithinWindow(delivered, new Date("2026-11-08T10:00:01Z"), 7)).toBe(false);
    expect(isWithinWindow(null, new Date(), 7)).toBe(false);
    expect(isShopFault("DEFECTIVE")).toBe(true);
    expect(isShopFault("SIZE_MISMATCH")).toBe(false);
  });
});
