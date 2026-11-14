/**
 * Inventory rules — pure functions, no database. The service applies them;
 * unit tests pin them down.
 *
 *   available = onHand - reserved   (never stored, never negative)
 *
 * Ledger invariant (checked by `npm run inventory:verify`):
 *   onHand   = sum(quantity) of every movement except RESERVE / RELEASE
 *   reserved = sum(quantity) of RESERVE / RELEASE movements
 */

export type MovementType =
  | "OPENING"
  | "PURCHASE_RECEIVE"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "TRANSFER_DISCREPANCY"
  | "COUNT_CORRECTION"
  | "RESERVE"
  | "RELEASE"
  | "SALE_ONLINE"
  | "SALE_STORE"
  | "RETURN";

/** Movement types that change `reserved` instead of `onHand`. */
export const RESERVATION_TYPES: ReadonlySet<string> = new Set(["RESERVE", "RELEASE"]);

/** How a signed movement quantity changes the stock row. */
export function movementDeltas(
  type: MovementType,
  quantity: number,
): { onHand: number; reserved: number } {
  return RESERVATION_TYPES.has(type)
    ? { onHand: 0, reserved: quantity }
    : { onHand: quantity, reserved: 0 };
}

export function availableOf(level: { onHand: number; reserved: number }): number {
  return Math.max(0, level.onHand - level.reserved);
}

/**
 * True when the change leaves a valid stock row: nothing negative and never
 * more reserved than on hand. The repository's conditional UPDATE uses the
 * same condition, and the database CHECK constraints are the backstop.
 */
export function isValidChange(
  level: { onHand: number; reserved: number },
  deltas: { onHand: number; reserved: number },
): boolean {
  const onHand = level.onHand + deltas.onHand;
  const reserved = level.reserved + deltas.reserved;
  return reserved >= 0 && onHand - reserved >= 0;
}

// ---------------------------------------------------------------------------
// storefront and low stock
// ---------------------------------------------------------------------------

/** What the storefront shows: three states, never a number. */
export type StockStatus = "in" | "few" | "out";

export function stockStatus(available: number, fewLeftThreshold: number): StockStatus {
  if (available <= 0) return "out";
  return available <= fewLeftThreshold ? "few" : "in";
}

/** A level's own threshold wins; otherwise the global setting applies. */
export function effectiveThreshold(levelThreshold: number | null, globalDefault: number): number {
  return levelThreshold ?? globalDefault;
}

export type LowStockState = "ok" | "low" | "out";

export function lowStockState(available: number, threshold: number): LowStockState {
  if (available <= 0) return "out";
  return available <= threshold ? "low" : "ok";
}

// ---------------------------------------------------------------------------
// purchase cost
// ---------------------------------------------------------------------------

/**
 * Weighted average cost after receiving `receivedQty` units at
 * `unitCostPoisha`. `currentQty` is everything the business owns of the
 * variant (every location plus stock in transit). Without a unit cost the
 * average is unchanged; without a usable current average (or stock) the new
 * unit cost becomes the average. Rounded to whole poisha.
 */
export function weightedAverageCost(input: {
  currentQty: number;
  currentCostPoisha: number | null;
  receivedQty: number;
  unitCostPoisha: number | null;
}): number | null {
  const { currentQty, currentCostPoisha, receivedQty, unitCostPoisha } = input;
  if (unitCostPoisha === null || receivedQty <= 0) return currentCostPoisha;
  if (currentCostPoisha === null || currentQty <= 0) return unitCostPoisha;
  return Math.round(
    (currentQty * currentCostPoisha + receivedQty * unitCostPoisha) / (currentQty + receivedQty),
  );
}

// ---------------------------------------------------------------------------
// manual adjustments
// ---------------------------------------------------------------------------

export const ADJUSTMENT_REASONS = ["DAMAGED", "LOST", "FOUND", "CORRECTION", "OTHER"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  DAMAGED: "Damaged",
  LOST: "Lost",
  FOUND: "Found",
  CORRECTION: "Correction of a wrong entry",
  OTHER: "Other (note required)",
};

/**
 * The ledger type for an adjustment, or an error message when the reason does
 * not fit the direction (damaged or lost stock can only go down, found stock
 * only up).
 */
export function adjustmentMovement(
  reason: AdjustmentReason,
  delta: number,
): { type: MovementType } | { error: string } {
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: "Enter a whole number other than zero." };
  }
  switch (reason) {
    case "DAMAGED":
      return delta < 0 ? { type: "DAMAGE" } : { error: "Damaged stock can only be removed." };
    case "LOST":
      return delta < 0 ? { type: "ADJUSTMENT_OUT" } : { error: "Lost stock can only be removed." };
    case "FOUND":
      return delta > 0 ? { type: "ADJUSTMENT_IN" } : { error: "Found stock can only be added." };
    case "CORRECTION":
    case "OTHER":
      return { type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT" };
  }
}

/** Adjustments bigger than the setting need an explicit confirmation. */
export function needsLargeAdjustmentConfirmation(delta: number, confirmAbove: number): boolean {
  return Math.abs(delta) > confirmAbove;
}

// ---------------------------------------------------------------------------
// stock counts
// ---------------------------------------------------------------------------

/**
 * Reconciles one counted line. Sales and transfers that happened between the
 * snapshot and the moment the shelf was counted are already reflected in what
 * was counted, so they move the expectation too:
 *
 *   expected   = snapshot + movements between snapshot and count
 *   correction = counted - expected
 */
export function reconcileCountLine(input: {
  systemQty: number;
  movementsSinceSnapshot: number;
  countedQty: number;
}): { expectedQty: number; difference: number } {
  const expectedQty = input.systemQty + input.movementsSinceSnapshot;
  return { expectedQty, difference: input.countedQty - expectedQty };
}

// ---------------------------------------------------------------------------
// references
// ---------------------------------------------------------------------------

/** TRF-2026-0001, CNT-2026-0001, RCV-2026-0001. */
export function formatDocumentReference(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}
