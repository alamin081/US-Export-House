/**
 * Checkout settings, stored as `Setting` rows (all provisional, owner decision
 * 2026-11-15, editable in the admin). The values below are only the fallbacks
 * used when a row is missing or malformed — staging and production are never
 * seeded, so they start from these.
 *
 * Deprecated (rows kept, never read): shipping.insideDhakaPoisha and
 * shipping.outsideDhakaPoisha (the ShippingZone table is the source of truth),
 * orders.numberPadding (the number format is UEH-YYMM-NNNNN).
 */
import { z } from "zod";

export interface CheckoutSettings {
  /** Delivery is free when the subtotal after the coupon reaches this. */
  freeShippingThresholdPoisha: number;
  /** Whether coupons also discount lines that are already on sale. */
  couponOnSaleItems: boolean;
  maxQtyPerVariant: number;
  maxItemsPerOrder: number;
  /** Above this total, cash on delivery is refused (online payment: Phase 10). */
  codMaxTotalPoisha: number;
  cartTtlDays: number;
  maxOpenOrdersPerPhone: number;
  maxOrdersPerIpPerHour: number;
  duplicateWindowMinutes: number;
  minFillSeconds: number;
  reviewItemsAtLeast: number;
  reviewFirstOrderAtLeastPoisha: number;
  couponAttemptsPer15Min: number;
  trackAttemptsPer15Min: number;
  /** Shown to customers (COD limit, blocked orders, confirmation page). */
  storeContactPhone: string;
  /** Order numbers read <prefix>-YYMM-NNNNN. */
  orderNumberPrefix: string;
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  freeShippingThresholdPoisha: 250_000,
  couponOnSaleItems: false,
  maxQtyPerVariant: 5,
  maxItemsPerOrder: 20,
  codMaxTotalPoisha: 2_000_000,
  cartTtlDays: 30,
  maxOpenOrdersPerPhone: 3,
  maxOrdersPerIpPerHour: 20,
  duplicateWindowMinutes: 30,
  minFillSeconds: 3,
  reviewItemsAtLeast: 10,
  reviewFirstOrderAtLeastPoisha: 1_000_000,
  couponAttemptsPer15Min: 10,
  trackAttemptsPer15Min: 10,
  storeContactPhone: "",
  orderNumberPrefix: "UEH",
};

export const CHECKOUT_SETTING_KEYS = {
  freeShippingThresholdPoisha: "shipping.freeThresholdPoisha",
  couponOnSaleItems: "checkout.couponOnSaleItems",
  maxQtyPerVariant: "checkout.maxQtyPerVariant",
  maxItemsPerOrder: "checkout.maxItemsPerOrder",
  codMaxTotalPoisha: "checkout.codMaxTotalPoisha",
  cartTtlDays: "cart.ttlDays",
  maxOpenOrdersPerPhone: "checkout.maxOpenOrdersPerPhone",
  maxOrdersPerIpPerHour: "checkout.maxOrdersPerIpPerHour",
  duplicateWindowMinutes: "checkout.duplicateWindowMinutes",
  minFillSeconds: "checkout.minFillSeconds",
  reviewItemsAtLeast: "checkout.reviewItemsAtLeast",
  reviewFirstOrderAtLeastPoisha: "checkout.reviewFirstOrderAtLeastPoisha",
  couponAttemptsPer15Min: "checkout.couponAttemptsPer15Min",
  trackAttemptsPer15Min: "checkout.trackAttemptsPer15Min",
  storeContactPhone: "store.contactPhone",
  orderNumberPrefix: "orders.numberPrefix",
} as const satisfies Record<keyof CheckoutSettings, string>;

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const checkoutSettingParsers = {
  freeShippingThresholdPoisha: int(0, 100_000_000),
  couponOnSaleItems: z.enum(["true", "false"]).transform((value) => value === "true"),
  maxQtyPerVariant: int(1, 100),
  maxItemsPerOrder: int(1, 500),
  codMaxTotalPoisha: int(10_000, 100_000_000),
  cartTtlDays: int(1, 365),
  maxOpenOrdersPerPhone: int(1, 100),
  maxOrdersPerIpPerHour: int(1, 10_000),
  duplicateWindowMinutes: int(0, 1_440),
  minFillSeconds: int(0, 120),
  reviewItemsAtLeast: int(1, 1_000),
  reviewFirstOrderAtLeastPoisha: int(0, 100_000_000),
  couponAttemptsPer15Min: int(1, 1_000),
  trackAttemptsPer15Min: int(1, 1_000),
  storeContactPhone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || /^\+?[0-9 -]{6,20}$/.test(value)),
  orderNumberPrefix: z.string().regex(/^[A-Z]{2,6}$/),
} satisfies Record<keyof CheckoutSettings, z.ZodType>;

export function parseCheckoutSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): CheckoutSettings {
  const result: Record<string, unknown> = { ...DEFAULT_CHECKOUT_SETTINGS };
  for (const field of Object.keys(checkoutSettingParsers) as Array<keyof CheckoutSettings>) {
    const value = raw.get(CHECKOUT_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = checkoutSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${CHECKOUT_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as CheckoutSettings;
}
