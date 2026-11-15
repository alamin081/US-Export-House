/**
 * Cart rules — pure. The cart stores only variant ids and quantities; every
 * time it is shown these rules compare it with the live catalogue and the
 * default online location's stock.
 */

export type LineProblem = "UNAVAILABLE" | "OUT_OF_STOCK" | "LOW_STOCK" | "OVER_LIMIT";

export interface LineCheck {
  problem: LineProblem | null;
  /** A quantity that would fix the line (LOW_STOCK / OVER_LIMIT). */
  suggestedQuantity: number | null;
}

/**
 * `live` = the product is published and not archived, the variant active and
 * not deleted. Any problem blocks checkout until the customer fixes the line.
 */
export function checkCartLine(input: {
  quantity: number;
  live: boolean;
  available: number;
  maxQtyPerVariant: number;
}): LineCheck {
  if (!input.live) return { problem: "UNAVAILABLE", suggestedQuantity: null };
  if (input.available <= 0) return { problem: "OUT_OF_STOCK", suggestedQuantity: null };
  if (input.quantity > input.available) {
    return {
      problem: "LOW_STOCK",
      suggestedQuantity: Math.min(input.available, input.maxQtyPerVariant),
    };
  }
  if (input.quantity > input.maxQtyPerVariant) {
    return { problem: "OVER_LIMIT", suggestedQuantity: input.maxQtyPerVariant };
  }
  return { problem: null, suggestedQuantity: null };
}

/** Price shown when the item was added (or last changed) vs now; null = unchanged. */
export function priceChange(
  seenPricePoisha: number | null,
  pricePoisha: number,
): { fromPoisha: number; toPoisha: number } | null {
  if (seenPricePoisha === null || seenPricePoisha === pricePoisha) return null;
  return { fromPoisha: seenPricePoisha, toPoisha: pricePoisha };
}

export type QuantityRefusal =
  | { refusal: "UNAVAILABLE" }
  | { refusal: "OUT_OF_STOCK" }
  | { refusal: "STOCK_LIMIT"; available: number }
  | { refusal: "PER_VARIANT"; max: number }
  | { refusal: "PER_ORDER"; max: number };

/**
 * The quantity a line may be set to. Lowering a quantity is always allowed
 * (so a customer can fix a line that went over the stock); raising it must
 * stay within stock and both limits.
 */
export function checkNewQuantity(input: {
  current: number;
  next: number;
  live: boolean;
  available: number;
  /** Units of every OTHER line in the cart. */
  otherUnits: number;
  maxQtyPerVariant: number;
  maxItemsPerOrder: number;
}): QuantityRefusal | null {
  if (input.next <= input.current) return null;
  if (!input.live) return { refusal: "UNAVAILABLE" };
  if (input.available <= 0) return { refusal: "OUT_OF_STOCK" };
  if (input.next > input.maxQtyPerVariant) {
    return { refusal: "PER_VARIANT", max: input.maxQtyPerVariant };
  }
  if (input.next > input.available) return { refusal: "STOCK_LIMIT", available: input.available };
  if (input.otherUnits + input.next > input.maxItemsPerOrder) {
    return { refusal: "PER_ORDER", max: input.maxItemsPerOrder };
  }
  return null;
}
