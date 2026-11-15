import { describe, expect, it } from "vitest";

import {
  buildZReport,
  exceedsDiscountLimit,
  priceTill,
  settlePayments,
} from "@/modules/pos/pos-rules";
import { countersFor, discountLimitFor, parsePosSettings } from "@/modules/settings/pos-settings";

const shirt = { variantId: "shirt", unitPricePoisha: 150_000, quantity: 2, discount: null };
const pant = { variantId: "pant", unitPricePoisha: 200_000, quantity: 1, discount: null };

describe("till totals", () => {
  it("adds lines with no discount", () => {
    const totals = priceTill({ lines: [shirt, pant], billDiscount: null, coupon: null });
    expect(totals).toMatchObject({
      subtotalPoisha: 500_000,
      discountPoisha: 0,
      totalPoisha: 500_000,
    });
  });

  it("applies a line discount, then a bill discount on what is left, spread over lines", () => {
    const totals = priceTill({
      lines: [{ ...shirt, discount: { kind: "PERCENT", value: 10 } }, pant],
      billDiscount: { kind: "AMOUNT", value: 47_000 },
      coupon: null,
    });
    // Shirt line 3,000 − 300 = 2,700; with the pant 4,700 left; ৳470 off the bill.
    expect(totals.manualDiscountPoisha).toBe(30_000 + 47_000);
    expect(totals.totalPoisha).toBe(500_000 - 77_000);
    const shirtLine = totals.lines.find((line) => line.variantId === "shirt")!;
    const pantLine = totals.lines.find((line) => line.variantId === "pant")!;
    expect(shirtLine.manualDiscountPoisha).toBe(30_000 + 27_000);
    expect(pantLine.manualDiscountPoisha).toBe(20_000);
    expect(shirtLine.discountPoisha + pantLine.discountPoisha).toBe(totals.discountPoisha);
  });

  it("never discounts below zero and caps the coupon at what is left", () => {
    const totals = priceTill({
      lines: [{ ...pant, discount: { kind: "AMOUNT", value: 999_999 } }],
      billDiscount: { kind: "PERCENT", value: 50 },
      coupon: { discountPoisha: 10_000, eligibleKeys: ["pant"] },
    });
    expect(totals).toMatchObject({
      totalPoisha: 0,
      couponDiscountPoisha: 0,
      manualDiscountPoisha: 200_000,
    });
  });

  it("puts a coupon only on its eligible lines", () => {
    const totals = priceTill({
      lines: [shirt, pant],
      billDiscount: null,
      coupon: { discountPoisha: 20_000, eligibleKeys: ["pant"] },
    });
    expect(totals.lines.find((line) => line.variantId === "pant")!.couponDiscountPoisha).toBe(
      20_000,
    );
    expect(totals.lines.find((line) => line.variantId === "shirt")!.couponDiscountPoisha).toBe(0);
    expect(totals.manualDiscountPoisha).toBe(0);
  });

  it("checks the seller's limit against typed discounts only", () => {
    expect(exceedsDiscountLimit(25_000, 500_000, 5)).toBe(false);
    expect(exceedsDiscountLimit(25_001, 500_000, 5)).toBe(true);
    expect(exceedsDiscountLimit(400_000, 500_000, null)).toBe(false);
  });
});

describe("split payment and change", () => {
  it("accepts cash with change plus a card with a reference", () => {
    const result = settlePayments(450_000, [
      { method: "CASH", amountPoisha: 250_000, tenderedPoisha: 300_000 },
      { method: "CARD", amountPoisha: 200_000, reference: "AUTH-7781" },
    ]);
    expect(result).toEqual({
      ok: true,
      changePoisha: 50_000,
      payments: [
        {
          method: "CASH",
          amountPoisha: 250_000,
          tenderedPoisha: 300_000,
          changePoisha: 50_000,
          reference: null,
        },
        {
          method: "CARD",
          amountPoisha: 200_000,
          tenderedPoisha: null,
          changePoisha: null,
          reference: "AUTH-7781",
        },
      ],
    });
  });

  it("refuses a short sum, short cash, a missing reference and two cash lines", () => {
    expect(settlePayments(100_000, [{ method: "CASH", amountPoisha: 90_000 }])).toEqual({
      ok: false,
      problem: "SUM_MISMATCH",
    });
    expect(
      settlePayments(100_000, [{ method: "CASH", amountPoisha: 100_000, tenderedPoisha: 50_000 }]),
    ).toEqual({ ok: false, problem: "TENDER_SHORT" });
    expect(
      settlePayments(100_000, [{ method: "BKASH", amountPoisha: 100_000, reference: "" }]),
    ).toEqual({
      ok: false,
      problem: "REFERENCE_MISSING",
    });
    expect(
      settlePayments(100_000, [
        { method: "CASH", amountPoisha: 50_000 },
        { method: "CASH", amountPoisha: 50_000 },
      ]),
    ).toEqual({ ok: false, problem: "TWO_CASH_LINES" });
    expect(settlePayments(0, [])).toMatchObject({ ok: true });
    expect(settlePayments(1, [])).toEqual({ ok: false, problem: "NONE" });
  });
});

describe("Z-report", () => {
  it("expects float + cash kept − cash refunded, and shows the difference", () => {
    const report = buildZReport({
      openingFloatPoisha: 200_000,
      sales: [
        { subtotalPoisha: 500_000, discountPoisha: 50_000, totalPoisha: 450_000 },
        { subtotalPoisha: 100_000, discountPoisha: 0, totalPoisha: 100_000 },
      ],
      payments: [
        { provider: "CASH", amountPoisha: 250_000 },
        { provider: "CARD", amountPoisha: 200_000 },
        { provider: "BKASH", amountPoisha: 100_000 },
      ],
      refunds: [
        { method: "CASH", amountPoisha: 30_000 },
        { method: "BKASH", amountPoisha: 10_000 },
      ],
      countedCashPoisha: 419_000,
    });
    expect(report).toMatchObject({
      bills: 2,
      grossPoisha: 600_000,
      discountPoisha: 50_000,
      netSalesPoisha: 550_000,
      paymentsByMethod: { CASH: 250_000, CARD: 200_000, BKASH: 100_000 },
      refundsPoisha: 40_000,
      expectedCashPoisha: 420_000,
      differencePoisha: -1_000,
    });
  });
});

describe("till settings", () => {
  it("reads limits and counters, and falls back on bad values", () => {
    const settings = parsePosSettings(
      new Map([
        ["pos.counters", '{"BR-GUL": ["2"]}'],
        ["pos.receiptWidthMm", "58"],
        ["pos.maxDiscountPercentByRole", "not json"],
      ]),
    );
    expect(countersFor(settings, "BR-GUL")).toEqual(["MAIN", "2"]);
    expect(countersFor(settings, "WH-DHK")).toEqual(["MAIN"]);
    expect(settings.receiptWidthMm).toBe(58);
    expect(discountLimitFor(settings, "Branch Sales Staff")).toBe(5);
    expect(discountLimitFor(settings, "Branch Manager")).toBe(15);
    expect(discountLimitFor(settings, "Store Manager")).toBeNull();
  });
});
