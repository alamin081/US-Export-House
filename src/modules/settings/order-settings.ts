/**
 * Order processing settings (Phase 9), stored as `Setting` rows. The values
 * below are only the fallbacks used when a row is missing or malformed —
 * staging and production are never seeded, so they start from these.
 */
import { z } from "zod";

export const COURIER_KEYS = ["STEADFAST", "PATHAO", "REDX", "MANUAL", "OTHER"] as const;
export type CourierKey = (typeof COURIER_KEYS)[number];

export const COURIER_LABELS: Record<CourierKey, string> = {
  STEADFAST: "Steadfast",
  PATHAO: "Pathao",
  REDX: "RedX",
  MANUAL: "Own delivery",
  OTHER: "Other courier",
};

export interface OrderSettings {
  /** Counted unanswered calls before an order is flagged "unreachable" (never auto-cancelled). */
  unreachableAfterAttempts: number;
  /** Minimum hours between two counted call attempts. */
  callRetryMinHours: number;
  /** Couriers offered when shipping, in this order. */
  couriers: CourierKey[];
  packingSlipSize: "A4" | "A5";
}

export const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  unreachableAfterAttempts: 3,
  callRetryMinHours: 2,
  couriers: [...COURIER_KEYS],
  packingSlipSize: "A4",
};

export const ORDER_SETTING_KEYS = {
  unreachableAfterAttempts: "orders.unreachableAfterAttempts",
  callRetryMinHours: "orders.callRetryMinHours",
  couriers: "orders.couriers",
  packingSlipSize: "orders.packingSlipSize",
} as const satisfies Record<keyof OrderSettings, string>;

const courierList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item !== ""),
  )
  .pipe(z.array(z.enum(COURIER_KEYS)).min(1))
  .transform((items) => [...new Set(items)]);

export const orderSettingParsers = {
  unreachableAfterAttempts: z.coerce.number().int().min(1).max(20),
  callRetryMinHours: z.coerce.number().int().min(0).max(72),
  couriers: courierList,
  packingSlipSize: z.enum(["A4", "A5"]),
} satisfies Record<keyof OrderSettings, z.ZodType>;

export function parseOrderSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): OrderSettings {
  const result: Record<string, unknown> = { ...DEFAULT_ORDER_SETTINGS };
  for (const field of Object.keys(orderSettingParsers) as Array<keyof OrderSettings>) {
    const value = raw.get(ORDER_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = orderSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${ORDER_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as OrderSettings;
}
