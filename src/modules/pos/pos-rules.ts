/**
 * Till (POS) money — pure, integer poisha. The browser sends quantities,
 * discounts as typed and payments; the server re-reads prices and rebuilds
 * every number here.
 *
 *   line discount   typed per line (% or taka), at most the line
 *   bill discount   typed on the bill, on what is left, spread over lines
 *   coupon          STORE/BOTH coupon, on what is left of its eligible lines
 *   total           subtotal − all discounts (no delivery in the shop)
 *
 * The seller's discount limit applies to the typed (manual) discounts only;
 * a coupon is a promotion the business already approved.
 */
import { allocateDiscount } from "@/modules/checkout/allocate";

export type DiscountInput = { kind: "PERCENT" | "AMOUNT"; value: number } | null;

export interface TillLineInput {
  variantId: string;
  unitPricePoisha: number;
  quantity: number;
  discount: DiscountInput;
}

export interface TillLine {
  variantId: string;
  lineTotalPoisha: number;
  manualDiscountPoisha: number;
  couponDiscountPoisha: number;
  discountPoisha: number;
}

export interface TillTotals {
  lines: TillLine[];
  subtotalPoisha: number;
  manualDiscountPoisha: number;
  couponDiscountPoisha: number;
  discountPoisha: number;
  totalPoisha: number;
}

function discountOn(amount: number, discount: DiscountInput): number {
  if (discount === null || amount <= 0) return 0;
  if (discount.kind === "PERCENT") {
    const percent = Math.max(0, Math.min(100, discount.value));
    return Math.floor((amount * percent) / 100);
  }
  return Math.max(0, Math.min(amount, Math.round(discount.value)));
}

export function priceTill(input: {
  lines: readonly TillLineInput[];
  billDiscount: DiscountInput;
  /** Coupon discount and the lines it may apply to (from evaluateCoupon). */
  coupon: { discountPoisha: number; eligibleKeys: readonly string[] } | null;
}): TillTotals {
  const base = input.lines.map((line) => {
    const total = line.unitPricePoisha * line.quantity;
    return { line, total, manual: discountOn(total, line.discount) };
  });
  const remainingAfterLines = base.reduce((sum, row) => sum + row.total - row.manual, 0);
  const bill = discountOn(remainingAfterLines, input.billDiscount);
  const billShares = allocateDiscount(
    bill,
    base.map((row) => ({ key: row.line.variantId, total: row.total - row.manual })),
  );
  const afterManual = base.map((row) => ({
    ...row,
    manual: row.manual + (billShares.get(row.line.variantId) ?? 0),
  }));
  const eligible = afterManual.filter((row) =>
    input.coupon?.eligibleKeys.includes(row.line.variantId),
  );
  const eligibleLeft = eligible.reduce((sum, row) => sum + row.total - row.manual, 0);
  const couponTotal = Math.max(0, Math.min(input.coupon?.discountPoisha ?? 0, eligibleLeft));
  const couponShares = allocateDiscount(
    couponTotal,
    eligible.map((row) => ({ key: row.line.variantId, total: row.total - row.manual })),
  );
  const lines = afterManual.map((row) => {
    const coupon = couponShares.get(row.line.variantId) ?? 0;
    return {
      variantId: row.line.variantId,
      lineTotalPoisha: row.total,
      manualDiscountPoisha: row.manual,
      couponDiscountPoisha: coupon,
      discountPoisha: row.manual + coupon,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalPoisha, 0);
  const manual = lines.reduce((sum, line) => sum + line.manualDiscountPoisha, 0);
  const couponDiscount = lines.reduce((sum, line) => sum + line.couponDiscountPoisha, 0);
  return {
    lines,
    subtotalPoisha: subtotal,
    manualDiscountPoisha: manual,
    couponDiscountPoisha: couponDiscount,
    discountPoisha: manual + couponDiscount,
    totalPoisha: subtotal - manual - couponDiscount,
  };
}

/** Over the seller's limit (percent of the subtotal); null limit = unlimited. */
export function exceedsDiscountLimit(
  manualDiscountPoisha: number,
  subtotalPoisha: number,
  limitPercent: number | null,
): boolean {
  if (limitPercent === null || manualDiscountPoisha <= 0) return false;
  return manualDiscountPoisha * 100 > limitPercent * subtotalPoisha;
}

// ---------------------------------------------------------------------------
// payments
// ---------------------------------------------------------------------------

export type TillMethod = "CASH" | "CARD" | "BKASH" | "NAGAD";

export const TILL_METHODS: readonly TillMethod[] = ["CASH", "CARD", "BKASH", "NAGAD"];

export interface PaymentInput {
  method: TillMethod;
  /** What this method pays towards the bill. */
  amountPoisha: number;
  /** Cash only: what the customer handed over. */
  tenderedPoisha?: number | null;
  reference?: string | null;
}

export interface SettledPayment {
  method: TillMethod;
  amountPoisha: number;
  tenderedPoisha: number | null;
  changePoisha: number | null;
  reference: string | null;
}

export type PaymentProblem =
  | "NONE"
  | "NOT_POSITIVE"
  | "SUM_MISMATCH"
  | "TENDER_SHORT"
  | "REFERENCE_MISSING"
  | "TWO_CASH_LINES";

/**
 * Split payment: the parts must add up to the bill exactly. Cash may be
 * over-tendered (change is given back); card, bKash and Nagad need a reference.
 */
export function settlePayments(
  totalPoisha: number,
  payments: readonly PaymentInput[],
):
  | { ok: true; payments: SettledPayment[]; changePoisha: number }
  | { ok: false; problem: PaymentProblem } {
  if (payments.length === 0)
    return totalPoisha === 0
      ? { ok: true, payments: [], changePoisha: 0 }
      : { ok: false, problem: "NONE" };
  if (payments.filter((payment) => payment.method === "CASH").length > 1) {
    return { ok: false, problem: "TWO_CASH_LINES" };
  }
  const settled: SettledPayment[] = [];
  for (const payment of payments) {
    if (!Number.isInteger(payment.amountPoisha) || payment.amountPoisha <= 0) {
      return { ok: false, problem: "NOT_POSITIVE" };
    }
    if (payment.method === "CASH") {
      const tendered = payment.tenderedPoisha ?? payment.amountPoisha;
      if (tendered < payment.amountPoisha) return { ok: false, problem: "TENDER_SHORT" };
      settled.push({
        method: "CASH",
        amountPoisha: payment.amountPoisha,
        tenderedPoisha: tendered,
        changePoisha: tendered - payment.amountPoisha,
        reference: null,
      });
      continue;
    }
    const reference = payment.reference?.trim() ?? "";
    if (reference.length < 3) return { ok: false, problem: "REFERENCE_MISSING" };
    settled.push({
      method: payment.method,
      amountPoisha: payment.amountPoisha,
      tenderedPoisha: null,
      changePoisha: null,
      reference,
    });
  }
  const sum = settled.reduce((total, payment) => total + payment.amountPoisha, 0);
  if (sum !== totalPoisha) return { ok: false, problem: "SUM_MISMATCH" };
  return {
    ok: true,
    payments: settled,
    changePoisha: settled.reduce((total, payment) => total + (payment.changePoisha ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// end of day (Z-report)
// ---------------------------------------------------------------------------

export interface ZReport {
  bills: number;
  grossPoisha: number;
  discountPoisha: number;
  netSalesPoisha: number;
  paymentsByMethod: Record<string, number>;
  refundsByMethod: Record<string, number>;
  refundsPoisha: number;
  openingFloatPoisha: number;
  cashSalesPoisha: number;
  cashRefundsPoisha: number;
  expectedCashPoisha: number;
  countedCashPoisha: number | null;
  differencePoisha: number | null;
}

/**
 * The day's figures. Expected cash in the drawer = opening float + cash kept
 * from sales (tendered − change) − cash refunded from the drawer.
 */
export function buildZReport(input: {
  openingFloatPoisha: number;
  sales: ReadonlyArray<{ subtotalPoisha: number; discountPoisha: number; totalPoisha: number }>;
  payments: ReadonlyArray<{ provider: string; amountPoisha: number }>;
  refunds: ReadonlyArray<{ method: string; amountPoisha: number }>;
  countedCashPoisha: number | null;
}): ZReport {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const byKey = (rows: ReadonlyArray<{ key: string; amount: number }>) => {
    const result: Record<string, number> = {};
    for (const row of rows) result[row.key] = (result[row.key] ?? 0) + row.amount;
    return result;
  };
  const paymentsByMethod = byKey(
    input.payments.map((row) => ({ key: row.provider, amount: row.amountPoisha })),
  );
  const refundsByMethod = byKey(
    input.refunds.map((row) => ({ key: row.method, amount: row.amountPoisha })),
  );
  const cashSales = paymentsByMethod.CASH ?? 0;
  const cashRefunds = refundsByMethod.CASH ?? 0;
  const expected = input.openingFloatPoisha + cashSales - cashRefunds;
  return {
    bills: input.sales.length,
    grossPoisha: sum(input.sales.map((sale) => sale.subtotalPoisha)),
    discountPoisha: sum(input.sales.map((sale) => sale.discountPoisha)),
    netSalesPoisha: sum(input.sales.map((sale) => sale.totalPoisha)),
    paymentsByMethod,
    refundsByMethod,
    refundsPoisha: sum(input.refunds.map((row) => row.amountPoisha)),
    openingFloatPoisha: input.openingFloatPoisha,
    cashSalesPoisha: cashSales,
    cashRefundsPoisha: cashRefunds,
    expectedCashPoisha: expected,
    countedCashPoisha: input.countedCashPoisha,
    differencePoisha: input.countedCashPoisha === null ? null : input.countedCashPoisha - expected,
  };
}
