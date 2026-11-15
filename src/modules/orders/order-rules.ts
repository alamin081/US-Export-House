/**
 * Order processing rules — pure: confirmation calls, editing an order's
 * lines, reservation changes and courier cash settlement. The services load
 * the facts and write the result; these functions decide.
 */
import type { CouponRecord } from "@/modules/checkout/coupon-rules";

// ---------------------------------------------------------------------------
// confirmation calls
// ---------------------------------------------------------------------------

export type CallOutcome =
  | "CONFIRMED"
  | "NO_ANSWER"
  | "SWITCHED_OFF"
  | "WRONG_NUMBER"
  | "CALL_BACK_LATER"
  | "CANCEL_REQUESTED";

export interface CallSettings {
  /** Counted unanswered attempts that make an order "unreachable". */
  unreachableAfterAttempts: number;
  /** Minimum gap between two counted attempts. */
  callRetryMinHours: number;
}

/**
 * Whether a call counts towards "unreachable": only no-answer / switched-off
 * calls, and only when enough time has passed since the last counted one —
 * three calls in five minutes are one attempt, not three.
 */
export function countsTowardUnreachable(input: {
  outcome: CallOutcome;
  at: Date;
  lastCountedAt: Date | null;
  settings: CallSettings;
}): boolean {
  if (input.outcome !== "NO_ANSWER" && input.outcome !== "SWITCHED_OFF") return false;
  if (input.lastCountedAt === null) return true;
  const gapMs = input.at.getTime() - input.lastCountedAt.getTime();
  return gapMs >= input.settings.callRetryMinHours * 60 * 60 * 1000;
}

export function isUnreachable(countedAttempts: number, settings: CallSettings): boolean {
  return countedAttempts >= settings.unreachableAfterAttempts;
}

/** Outcomes the staff member should act on straight away. */
export function callNeedsAttention(outcome: CallOutcome): boolean {
  return outcome === "WRONG_NUMBER" || outcome === "CANCEL_REQUESTED";
}

// ---------------------------------------------------------------------------
// editing lines
// ---------------------------------------------------------------------------

export interface ExistingLine {
  variantId: string | null;
  unitPricePoisha: number;
  quantity: number;
}

export interface RequestedLine {
  variantId: string;
  quantity: number;
}

export interface PlannedLine {
  variantId: string;
  quantity: number;
  unitPricePoisha: number;
  /** KEPT: the order-time price of an existing line; CURRENT: today's price. */
  priceSource: "KEPT" | "CURRENT";
}

/** Merges duplicate variants in a request (quantities added), keeping first-seen order. */
export function mergeRequestedLines(lines: readonly RequestedLine[]): RequestedLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * The edited order's lines. A variant already on the order keeps the price
 * the customer was quoted (even when only its quantity changes); a variant
 * that is new to the order — another size or colour included — takes
 * today's price (owner decision 2026-11-15).
 */
export function planEditedLines(input: {
  existing: readonly ExistingLine[];
  requested: readonly RequestedLine[];
  currentPrices: ReadonlyMap<string, number>;
}): { ok: true; lines: PlannedLine[] } | { ok: false; missing: string[] } {
  const kept = new Map<string, number>();
  for (const line of input.existing) {
    if (line.variantId !== null && !kept.has(line.variantId)) {
      kept.set(line.variantId, line.unitPricePoisha);
    }
  }
  const missing: string[] = [];
  const lines: PlannedLine[] = [];
  for (const line of mergeRequestedLines(input.requested)) {
    if (line.quantity <= 0) continue;
    const old = kept.get(line.variantId);
    if (old !== undefined) {
      lines.push({ ...line, unitPricePoisha: old, priceSource: "KEPT" });
      continue;
    }
    const current = input.currentPrices.get(line.variantId);
    if (current === undefined) {
      missing.push(line.variantId);
      continue;
    }
    lines.push({ ...line, unitPricePoisha: current, priceSource: "CURRENT" });
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, lines };
}

/**
 * Net reservation change per variant between two sets of lines: positive
 * means reserve more, negative means release. Variants that did not change
 * are left out, so an address-only edit touches no stock row.
 */
export function reservationDelta(
  before: ReadonlyArray<{ variantId: string | null; quantity: number }>,
  after: ReadonlyArray<{ variantId: string; quantity: number }>,
): Array<{ variantId: string; quantity: number }> {
  const net = new Map<string, number>();
  for (const line of before) {
    if (line.variantId === null) continue;
    net.set(line.variantId, (net.get(line.variantId) ?? 0) - line.quantity);
  }
  for (const line of after) net.set(line.variantId, (net.get(line.variantId) ?? 0) + line.quantity);
  return [...net.entries()]
    .filter(([, quantity]) => quantity !== 0)
    .map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * The coupon as it is re-checked after an edit. The use was already counted
 * when the order was placed, and the customer was promised the coupon at
 * that moment, so usage limits, the active flag and the validity window are
 * judged as at placement; only the basket conditions (scope, minimum) are
 * checked again.
 */
export function couponForEdit(coupon: CouponRecord): CouponRecord {
  return {
    ...coupon,
    channel: coupon.channel === "STORE" ? "BOTH" : coupon.channel,
    usageLimit: null,
    usageLimitPerCustomer: null,
    isActive: true,
    deletedAt: null,
  };
}

// ---------------------------------------------------------------------------
// courier cash (COD) settlement
// ---------------------------------------------------------------------------

export interface SettlementLine {
  orderId: string;
  /** The COD amount the courier was asked to collect. */
  expectedPoisha: number;
  /** What the courier paid for it (defaults to expected). */
  receivedPoisha: number;
}

export type SettlementProblem = "EMPTY" | "NEGATIVE" | "ABOVE_EXPECTED" | "DUPLICATE_ORDER";

export interface SettlementResult {
  expectedPoisha: number;
  /** Received + courier charge − expected. Not zero is a mismatch to look into. */
  differencePoisha: number;
  /** Orders whose own amount was paid in full: their payment becomes PAID. */
  paidOrderIds: string[];
  /** Orders paid short: they stay UNPAID with what was received recorded. */
  shortOrderIds: string[];
}

export function settleCod(input: {
  lines: readonly SettlementLine[];
  receivedPoisha: number;
  courierChargePoisha: number;
}): { ok: true; result: SettlementResult } | { ok: false; problem: SettlementProblem } {
  if (input.lines.length === 0) return { ok: false, problem: "EMPTY" };
  if (input.receivedPoisha < 0 || input.courierChargePoisha < 0) {
    return { ok: false, problem: "NEGATIVE" };
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.orderId)) return { ok: false, problem: "DUPLICATE_ORDER" };
    seen.add(line.orderId);
    if (line.receivedPoisha < 0 || line.expectedPoisha < 0) {
      return { ok: false, problem: "NEGATIVE" };
    }
    if (line.receivedPoisha > line.expectedPoisha) return { ok: false, problem: "ABOVE_EXPECTED" };
  }
  const expected = input.lines.reduce((sum, line) => sum + line.expectedPoisha, 0);
  return {
    ok: true,
    result: {
      expectedPoisha: expected,
      differencePoisha: input.receivedPoisha + input.courierChargePoisha - expected,
      paidOrderIds: input.lines
        .filter((line) => line.receivedPoisha === line.expectedPoisha)
        .map((line) => line.orderId),
      shortOrderIds: input.lines
        .filter((line) => line.receivedPoisha < line.expectedPoisha)
        .map((line) => line.orderId),
    },
  };
}
