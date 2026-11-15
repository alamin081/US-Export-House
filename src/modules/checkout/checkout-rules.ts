/**
 * Small checkout rules — pure: delivery zone lookup, order numbers, cart
 * limits, review flags and the fraud limits.
 */

// ---------------------------------------------------------------------------
// delivery zone
// ---------------------------------------------------------------------------

export interface ZoneRef {
  id: string;
  code: string;
  isActive: boolean;
  isDefault: boolean;
}

/**
 * Upazila mapping first, then the district's, then the default (fallback)
 * zone. An inactive mapped zone falls through to the next level.
 */
export function resolveZone<Z extends ZoneRef>(input: {
  upazilaZoneId: string | null;
  districtZoneId: string | null;
  zones: readonly Z[];
}): Z | null {
  const active = (id: string | null) =>
    id === null ? undefined : input.zones.find((zone) => zone.id === id && zone.isActive);
  return (
    active(input.upazilaZoneId) ??
    active(input.districtZoneId) ??
    input.zones.find((zone) => zone.isDefault && zone.isActive) ??
    null
  );
}

// ---------------------------------------------------------------------------
// order numbers
// ---------------------------------------------------------------------------

/** UEH-YYMM-NNNNN, the month in Bangladesh time. The sequence never resets. */
export function formatOrderNumber(prefix: string, placedAt: Date, sequence: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(placedAt);
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  return `${prefix}-${year}${month}-${String(sequence).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// limits
// ---------------------------------------------------------------------------

export type CartLimitProblem =
  { problem: "PER_VARIANT"; max: number } | { problem: "PER_ORDER"; max: number };

export function checkCartLimits(
  quantities: readonly number[],
  limits: { maxQtyPerVariant: number; maxItemsPerOrder: number },
): CartLimitProblem | null {
  if (quantities.some((quantity) => quantity > limits.maxQtyPerVariant)) {
    return { problem: "PER_VARIANT", max: limits.maxQtyPerVariant };
  }
  if (quantities.reduce((sum, quantity) => sum + quantity, 0) > limits.maxItemsPerOrder) {
    return { problem: "PER_ORDER", max: limits.maxItemsPerOrder };
  }
  return null;
}

export type FraudLimit = "PHONE_OPEN_ORDERS" | "IP_ORDERS";

/** Called inside the order transaction with fresh counts. */
export function checkOrderRateLimits(
  counts: { openOrdersForPhone: number; ordersFromIpLastHour: number },
  limits: { maxOpenOrdersPerPhone: number; maxOrdersPerIpPerHour: number },
): FraudLimit | null {
  if (counts.openOrdersForPhone >= limits.maxOpenOrdersPerPhone) return "PHONE_OPEN_ORDERS";
  if (counts.ordersFromIpLastHour >= limits.maxOrdersPerIpPerHour) return "IP_ORDERS";
  return null;
}

/** Orders that are taken, but flagged for a closer look in Phase 9. */
export function reviewReasons(input: {
  itemCount: number;
  totalPoisha: number;
  firstOrderForPhone: boolean;
  reviewItemsAtLeast: number;
  reviewFirstOrderAtLeastPoisha: number;
}): string[] {
  const reasons: string[] = [];
  if (input.itemCount >= input.reviewItemsAtLeast) reasons.push("LARGE_QUANTITY");
  if (input.firstOrderForPhone && input.totalPoisha >= input.reviewFirstOrderAtLeastPoisha) {
    reasons.push("FIRST_ORDER_HIGH_VALUE");
  }
  return reasons;
}
