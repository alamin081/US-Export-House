/**
 * Report formulas — pure, no database (plan section 3).
 *
 *   Gross                 Σ subtotal of orders sold in the period (soldAt)
 * − Discount              Σ discount (coupons and till discounts)
 * = Goods sales
 * − Refunds               completed refunds, goods part only (processedAt)
 * − Exchange credit       credit carried to exchange orders (their soldAt)
 * − Delivery returns      goods of RETURNED_TO_WAREHOUSE orders (returnedToWarehouseAt)
 * = Net sales
 *
 * Delivery income is reported beside it, never inside net sales:
 * Σ shipping − shipping refunds − delivery charge of returned deliveries.
 */

export type Channel = "ONLINE" | "STORE";

/** Aggregated facts for one Dhaka day, channel and location. */
export interface SalesFact {
  day: string;
  channel: Channel;
  locationId: string;
  orders: number;
  grossPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  refundGoodsPoisha: number;
  refundShippingPoisha: number;
  /** Part of the refunds (goods + shipping) paid out of a till drawer. */
  tillRefundPoisha: number;
  exchangeCreditPoisha: number;
  deliveryReturnOrders: number;
  deliveryReturnGoodsPoisha: number;
  deliveryReturnShippingPoisha: number;
}

export interface SalesTotals {
  orders: number;
  grossPoisha: number;
  discountPoisha: number;
  goodsSalesPoisha: number;
  refundsPoisha: number;
  exchangeCreditPoisha: number;
  deliveryReturnsPoisha: number;
  deliveryReturnOrders: number;
  netSalesPoisha: number;
  deliveryIncomePoisha: number;
  /** Goods sales per order; null without orders. */
  averageOrderPoisha: number | null;
  /** All refunds (goods + shipping) paid from a till, and the rest. */
  refundsAtTillPoisha: number;
  refundsElsewherePoisha: number;
}

export function emptyFact(day: string, channel: Channel, locationId: string): SalesFact {
  return {
    day,
    channel,
    locationId,
    orders: 0,
    grossPoisha: 0,
    discountPoisha: 0,
    shippingPoisha: 0,
    refundGoodsPoisha: 0,
    refundShippingPoisha: 0,
    tillRefundPoisha: 0,
    exchangeCreditPoisha: 0,
    deliveryReturnOrders: 0,
    deliveryReturnGoodsPoisha: 0,
    deliveryReturnShippingPoisha: 0,
  };
}

const ADDITIVE: ReadonlyArray<Exclude<keyof SalesFact, "day" | "channel" | "locationId">> = [
  "orders",
  "grossPoisha",
  "discountPoisha",
  "shippingPoisha",
  "refundGoodsPoisha",
  "refundShippingPoisha",
  "tillRefundPoisha",
  "exchangeCreditPoisha",
  "deliveryReturnOrders",
  "deliveryReturnGoodsPoisha",
  "deliveryReturnShippingPoisha",
];

/** Adds `b` into `a` (same shape, any key). */
export function addFact(a: SalesFact, b: SalesFact): void {
  for (const key of ADDITIVE) a[key] += b[key];
}

export function totalsOf(facts: Iterable<SalesFact>): SalesTotals {
  const sum = emptyFact("", "ONLINE", "");
  for (const fact of facts) addFact(sum, fact);
  const goodsSales = sum.grossPoisha - sum.discountPoisha;
  const refunds = sum.refundGoodsPoisha;
  const allRefunds = sum.refundGoodsPoisha + sum.refundShippingPoisha;
  return {
    orders: sum.orders,
    grossPoisha: sum.grossPoisha,
    discountPoisha: sum.discountPoisha,
    goodsSalesPoisha: goodsSales,
    refundsPoisha: refunds,
    exchangeCreditPoisha: sum.exchangeCreditPoisha,
    deliveryReturnsPoisha: sum.deliveryReturnGoodsPoisha,
    deliveryReturnOrders: sum.deliveryReturnOrders,
    netSalesPoisha: goodsSales - refunds - sum.exchangeCreditPoisha - sum.deliveryReturnGoodsPoisha,
    deliveryIncomePoisha:
      sum.shippingPoisha - sum.refundShippingPoisha - sum.deliveryReturnShippingPoisha,
    averageOrderPoisha: sum.orders === 0 ? null : Math.round(goodsSales / sum.orders),
    refundsAtTillPoisha: sum.tillRefundPoisha,
    refundsElsewherePoisha: allRefunds - sum.tillRefundPoisha,
  };
}

/** Totals per group key, in first-seen order. */
export function groupTotals(
  facts: readonly SalesFact[],
  keyOf: (fact: SalesFact) => string,
): Map<string, SalesTotals> {
  const groups = new Map<string, SalesFact[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [fact]);
    else list.push(fact);
  }
  return new Map([...groups].map(([key, list]) => [key, totalsOf(list)]));
}

/**
 * Splits an amount over weights with the largest-remainder method, so the
 * parts are whole poisha and always add up to the amount exactly.
 */
export function allocate(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weights.length === 0) return [];
  if (total <= 0) {
    // No basis to split on: everything goes to the first part.
    return weights.map((_, index) => (index === 0 ? amount : 0));
  }
  const exact = weights.map((weight) => (amount * Math.max(0, weight)) / total);
  const parts = exact.map((value) => Math.floor(value));
  let left = amount - parts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index]! += 1;
    left -= 1;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// line level (products, categories, profit)
// ---------------------------------------------------------------------------

/**
 * One order line's contribution in the period: what was sold, and what came
 * back (refund, exchange or failed delivery), with the purchase cost snapshot.
 */
export interface LineFact {
  variantId: string | null;
  sku: string;
  productName: string;
  size: string | null;
  colour: string | null;
  channel: Channel;
  locationId: string;
  /** True when the sold line carries a purchase cost snapshot. */
  costKnown: boolean;
  soldQty: number;
  grossPoisha: number;
  discountPoisha: number;
  returnedQty: number;
  returnedPoisha: number;
  /** Cost of units sold minus cost of units that came back to stock (0 when unknown). */
  costPoisha: number;
}

export interface LineTotals {
  soldQty: number;
  returnedQty: number;
  grossPoisha: number;
  discountPoisha: number;
  /** Goods sales minus everything that came back. */
  netPoisha: number;
  /** Net of lines with a known cost. */
  knownNetPoisha: number;
  costPoisha: number;
  /** Null when no line has a known cost. */
  profitPoisha: number | null;
  /** Percent of knownNet; null when knownNet is 0 or no cost is known. */
  marginPercent: number | null;
  /** Net of lines sold before the cost snapshot existed. */
  unknownCostNetPoisha: number;
}

export function lineTotals(facts: Iterable<LineFact>): LineTotals {
  let soldQty = 0;
  let returnedQty = 0;
  let gross = 0;
  let discount = 0;
  let net = 0;
  let knownNet = 0;
  let cost = 0;
  let anyKnown = false;
  for (const fact of facts) {
    const lineNet = fact.grossPoisha - fact.discountPoisha - fact.returnedPoisha;
    soldQty += fact.soldQty;
    returnedQty += fact.returnedQty;
    gross += fact.grossPoisha;
    discount += fact.discountPoisha;
    net += lineNet;
    if (fact.costKnown) {
      anyKnown = true;
      knownNet += lineNet;
      cost += fact.costPoisha;
    }
  }
  const profit = anyKnown ? knownNet - cost : null;
  return {
    soldQty,
    returnedQty,
    grossPoisha: gross,
    discountPoisha: discount,
    netPoisha: net,
    knownNetPoisha: knownNet,
    costPoisha: cost,
    profitPoisha: profit,
    marginPercent:
      profit === null || knownNet === 0 ? null : Math.round((profit / knownNet) * 1000) / 10,
    unknownCostNetPoisha: net - knownNet,
  };
}

export function groupLines(
  facts: readonly LineFact[],
  keyOf: (fact: LineFact) => string,
): Map<string, LineTotals> {
  const groups = new Map<string, LineFact[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [fact]);
    else list.push(fact);
  }
  return new Map([...groups].map(([key, list]) => [key, lineTotals(list)]));
}

// ---------------------------------------------------------------------------
// COD ageing
// ---------------------------------------------------------------------------

export const COD_AGE_BUCKETS = ["0-7", "8-15", "15+"] as const;
export type CodAgeBucket = (typeof COD_AGE_BUCKETS)[number];

export const COD_AGE_LABELS: Record<CodAgeBucket, string> = {
  "0-7": "0–7 days",
  "8-15": "8–15 days",
  "15+": "Over 15 days",
};

export function codAgeBucket(ageDays: number): CodAgeBucket {
  if (ageDays <= 7) return "0-7";
  if (ageDays <= 15) return "8-15";
  return "15+";
}

export function percentOf(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}
