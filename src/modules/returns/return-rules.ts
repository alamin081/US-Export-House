/**
 * Return, refund and exchange money — pure, integer poisha.
 *
 * A returned unit is worth its price minus its line's share of the order
 * discount (the Phase 8 split). Partial returns are valued cumulatively, so
 * returning a line in several goes adds up to exactly the line's net value
 * and no poisha is lost or gained by rounding:
 *
 *   credit(k more units) = floor(net × (done + k) / qty) − floor(net × done / qty)
 *   net = lineTotal − lineDiscount
 *
 * Example (approved plan): shirt ৳1,500 × 2 with ৳300 of a 10% coupon, pant
 * ৳2,000 × 1 with ৳200. One shirt back: (3,000 − 300) × 1/2 = ৳1,350. The
 * defective pant: ৳1,800 plus the ৳70 delivery charge = ৳1,870.
 */

export type ReturnReason = "SIZE_MISMATCH" | "DEFECTIVE" | "WRONG_ITEM" | "CHANGED_MIND" | "OTHER";

export const RETURN_REASONS: readonly ReturnReason[] = [
  "SIZE_MISMATCH",
  "DEFECTIVE",
  "WRONG_ITEM",
  "CHANGED_MIND",
  "OTHER",
];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  SIZE_MISMATCH: "Size did not fit",
  DEFECTIVE: "Defective",
  WRONG_ITEM: "Wrong item sent",
  CHANGED_MIND: "Did not like it",
  OTHER: "Other",
};

export const REFUND_METHODS = ["BKASH", "NAGAD", "BANK_TRANSFER", "CASH"] as const;

export const REFUND_METHOD_LABELS: Record<(typeof REFUND_METHODS)[number], string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash (at the shop)",
};

/** The shop's fault: delivery is refunded and exchange delivery is free. */
export function isShopFault(reason: ReturnReason | null): boolean {
  return reason === "DEFECTIVE" || reason === "WRONG_ITEM";
}

export interface LineValue {
  lineTotalPoisha: number;
  discountPoisha: number;
  quantity: number;
}

/** Value of `units` more units of a line, given `alreadyCredited` units before. */
export function unitsCredit(line: LineValue, alreadyCredited: number, units: number): number {
  if (units <= 0) return 0;
  if (alreadyCredited < 0 || alreadyCredited + units > line.quantity) {
    throw new Error("More units than the line has.");
  }
  const net = line.lineTotalPoisha - line.discountPoisha;
  const upTo = (count: number) => Math.floor((net * count) / line.quantity);
  return upTo(alreadyCredited + units) - upTo(alreadyCredited);
}

/** Inside the return window: delivered, and no more than `windowDays` ago. */
export function isWithinWindow(deliveredAt: Date | null, now: Date, windowDays: number): boolean {
  if (deliveredAt === null) return false;
  return now.getTime() - deliveredAt.getTime() <= windowDays * 24 * 60 * 60 * 1000;
}

export function windowEndsAt(deliveredAt: Date, windowDays: number): Date {
  return new Date(deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
}

/** Units of a line still open to a return request. */
export function returnableQuantity(ordered: number, alreadyRequested: number): number {
  return Math.max(0, ordered - alreadyRequested);
}

// ---------------------------------------------------------------------------
// refunds
// ---------------------------------------------------------------------------

export interface RefundPlan {
  itemsPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
}

/**
 * What a return refunds: the credit of every unit accepted back (damaged on
 * arrival included; rejected units excluded) plus — on the shop's fault, when
 * the setting allows and it was not refunded before — the delivery charge.
 * Never more than what is still refundable on the order.
 */
export function planRefund(input: {
  acceptedCredits: readonly number[];
  reason: ReturnReason | null;
  orderShippingPoisha: number;
  shippingAlreadyRefunded: boolean;
  refundShippingOnFault: boolean;
  refundablePoisha: number;
}): { ok: true; plan: RefundPlan } | { ok: false; problem: "NOTHING" | "ABOVE_PAID" } {
  const items = input.acceptedCredits.reduce((sum, value) => sum + value, 0);
  const shipping =
    input.refundShippingOnFault && isShopFault(input.reason) && !input.shippingAlreadyRefunded
      ? input.orderShippingPoisha
      : 0;
  const total = items + shipping;
  if (total <= 0) return { ok: false, problem: "NOTHING" };
  if (total > input.refundablePoisha) return { ok: false, problem: "ABOVE_PAID" };
  return { ok: true, plan: { itemsPoisha: items, shippingPoisha: shipping, totalPoisha: total } };
}

/** PENDING (needs approval) unless the amount is within the limit or the recorder may approve. */
export function needsApproval(input: {
  amountPoisha: number;
  approvalAbovePoisha: number;
  recorderCanApprove: boolean;
}): boolean {
  return !input.recorderCanApprove && input.amountPoisha > input.approvalAbovePoisha;
}

/** Payment status once refunds are added up. */
export function paymentStatusAfterRefund(
  paidPoisha: number,
  refundedPoisha: number,
): "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" {
  if (refundedPoisha <= 0) return "PAID";
  return refundedPoisha >= paidPoisha ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

// ---------------------------------------------------------------------------
// exchanges
// ---------------------------------------------------------------------------

export interface ExchangeInput {
  /** The returned units: their credit and what replaces them. */
  lines: ReadonlyArray<{
    quantity: number;
    creditPoisha: number;
    originalProductId: string;
    originalUnitPricePoisha: number;
    replacement: { variantId: string; productId: string; currentPricePoisha: number };
  }>;
  reason: ReturnReason | null;
  zoneRatePoisha: number;
  exchangeShippingPaidBy: "CUSTOMER" | "SHOP";
}

export interface ExchangePlan {
  lines: Array<{
    variantId: string;
    quantity: number;
    unitPricePoisha: number;
    discountPoisha: number;
  }>;
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  /** Credit applied to the new order (paid by EXCHANGE_CREDIT). */
  creditUsedPoisha: number;
  /** Credit beyond the new goods: refunded to the customer. */
  creditLeftPoisha: number;
  /** What the customer still pays (cash on delivery). */
  toPayPoisha: number;
}

/**
 * The replacement order of an exchange. Another size or colour of the same
 * product costs what the customer already paid for it (the original price
 * with the same discount), so a straight size swap costs nothing but the
 * delivery. A different product takes today's price; the customer pays the
 * difference, or gets back what is left of the credit.
 */
export function planExchange(input: ExchangeInput): ExchangePlan {
  const lines = input.lines.map((line) => {
    const sameProduct = line.replacement.productId === line.originalProductId;
    const unit = sameProduct ? line.originalUnitPricePoisha : line.replacement.currentPricePoisha;
    const gross = unit * line.quantity;
    return {
      variantId: line.replacement.variantId,
      quantity: line.quantity,
      unitPricePoisha: unit,
      discountPoisha: sameProduct ? Math.max(0, Math.min(gross, gross - line.creditPoisha)) : 0,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unitPricePoisha * line.quantity, 0);
  const discount = lines.reduce((sum, line) => sum + line.discountPoisha, 0);
  const shipping =
    isShopFault(input.reason) || input.exchangeShippingPaidBy === "SHOP" ? 0 : input.zoneRatePoisha;
  const goodsNet = subtotal - discount;
  const credit = input.lines.reduce((sum, line) => sum + line.creditPoisha, 0);
  const creditUsed = Math.min(credit, goodsNet);
  const total = goodsNet + shipping;
  return {
    lines,
    subtotalPoisha: subtotal,
    discountPoisha: discount,
    shippingPoisha: shipping,
    totalPoisha: total,
    creditUsedPoisha: creditUsed,
    creditLeftPoisha: credit - creditUsed,
    toPayPoisha: total - creditUsed,
  };
}

// ---------------------------------------------------------------------------
// return request states
// ---------------------------------------------------------------------------

export type ReturnStatus =
  "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "INSPECTED" | "COMPLETED" | "CANCELLED";

export type ReturnStep = "APPROVE" | "REJECT" | "RECEIVE" | "INSPECT" | "CLOSE";

const STEPS: Record<ReturnStep, { from: readonly ReturnStatus[]; to: ReturnStatus }> = {
  APPROVE: { from: ["REQUESTED"], to: "APPROVED" },
  REJECT: { from: ["REQUESTED"], to: "REJECTED" },
  RECEIVE: { from: ["APPROVED"], to: "RECEIVED" },
  INSPECT: { from: ["RECEIVED"], to: "INSPECTED" },
  CLOSE: { from: ["INSPECTED"], to: "COMPLETED" },
};

export function canStep(status: ReturnStatus, step: ReturnStep): boolean {
  return STEPS[step].from.includes(status);
}

export function stepTarget(step: ReturnStep): ReturnStatus {
  return STEPS[step].to;
}

/** Requests that still hold units of an order (for "already requested"). */
export function isOpenOrDone(status: ReturnStatus): boolean {
  return status !== "REJECTED" && status !== "CANCELLED";
}
