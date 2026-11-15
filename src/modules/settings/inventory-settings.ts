/**
 * Inventory settings, stored as `Setting` rows. The values below are only the
 * fallbacks used when a row is missing or malformed (staging and production
 * are never seeded, so they start from these).
 *
 * `fulfillment.defaultLocationCode` is DEPRECATED (Phase 7): the location
 * flagged `isDefaultOnlineFulfillment` is the single source of truth. The row
 * is kept in the database but nothing reads it any more.
 */
import { z } from "zod";

export interface InventorySettings {
  /** Admin low-stock alert when a stock row has no threshold of its own. */
  lowStockDefaultThreshold: number;
  /** Storefront "only a few left" at or below this many available online. */
  fewLeftThreshold: number;
  /** DRAFT -> APPROVED -> DISPATCHED instead of DRAFT -> DISPATCHED. */
  transferRequireApproval: boolean;
  importMaxRows: number;
  importMaxBytes: number;
  /** Adjustments larger than this many units need an explicit confirmation. */
  adjustConfirmAbove: number;
}

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  lowStockDefaultThreshold: 5,
  fewLeftThreshold: 3,
  transferRequireApproval: false,
  importMaxRows: 5000,
  importMaxBytes: 2 * 1024 * 1024,
  adjustConfirmAbove: 20,
};

export const INVENTORY_SETTING_KEYS = {
  lowStockDefaultThreshold: "inventory.lowStockDefaultThreshold",
  fewLeftThreshold: "storefront.fewLeftThreshold",
  transferRequireApproval: "transfer.requireApproval",
  importMaxRows: "inventory.import.maxRows",
  importMaxBytes: "inventory.import.maxBytes",
  adjustConfirmAbove: "inventory.adjust.confirmAbove",
} as const satisfies Record<keyof InventorySettings, string>;

export const inventorySettingParsers = {
  lowStockDefaultThreshold: z.coerce.number().int().min(0).max(10_000),
  fewLeftThreshold: z.coerce.number().int().min(0).max(1_000),
  transferRequireApproval: z.enum(["true", "false"]).transform((value) => value === "true"),
  importMaxRows: z.coerce.number().int().min(1).max(50_000),
  importMaxBytes: z.coerce
    .number()
    .int()
    .min(10 * 1024)
    .max(20 * 1024 * 1024),
  adjustConfirmAbove: z.coerce.number().int().min(1).max(100_000),
} satisfies Record<keyof InventorySettings, z.ZodType>;

export function parseInventorySettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): InventorySettings {
  const result: Record<string, unknown> = { ...DEFAULT_INVENTORY_SETTINGS };
  for (const field of Object.keys(inventorySettingParsers) as Array<keyof InventorySettings>) {
    const value = raw.get(INVENTORY_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = inventorySettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${INVENTORY_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as InventorySettings;
}
