/**
 * Shop details printed on invoices, receipts and labels, plus the VAT
 * display switches (Phase 9). The owner fills them in from the admin; empty
 * values are simply left off the printouts. VAT is not charged on top:
 * prices already include it (owner decision 2026-11-15, vat.enabled=false),
 * and the switches only control whether the BIN and the VAT share are shown.
 */
import { z } from "zod";

export interface StoreSettings {
  nameEn: string;
  nameBn: string;
  addressEn: string;
  addressBn: string;
  /** Shown to customers (also used by checkout; key store.contactPhone). */
  contactPhone: string;
  /** An https image URL (Cloudinary); printed instead of the name when set. */
  logoUrl: string;
  vatEnabled: boolean;
  vatRatePercent: number;
  vatBin: string;
  /** Print the VAT share contained in the total (needs vatEnabled and a rate). */
  vatShowBreakdown: boolean;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  nameEn: "",
  nameBn: "",
  addressEn: "",
  addressBn: "",
  contactPhone: "",
  logoUrl: "",
  vatEnabled: false,
  vatRatePercent: 0,
  vatBin: "",
  vatShowBreakdown: false,
};

export const STORE_SETTING_KEYS = {
  nameEn: "store.nameEn",
  nameBn: "store.nameBn",
  addressEn: "store.addressEn",
  addressBn: "store.addressBn",
  contactPhone: "store.contactPhone",
  logoUrl: "store.logoUrl",
  vatEnabled: "vat.enabled",
  vatRatePercent: "vat.ratePercent",
  vatBin: "vat.bin",
  vatShowBreakdown: "vat.showBreakdown",
} as const satisfies Record<keyof StoreSettings, string>;

const text = (max: number) => z.string().trim().max(max);
const bool = z.enum(["true", "false"]).transform((value) => value === "true");

export const storeSettingParsers = {
  nameEn: text(120),
  nameBn: text(120),
  addressEn: text(300),
  addressBn: text(300),
  contactPhone: text(40).refine((value) => value === "" || /^\+?[0-9 -]{6,20}$/.test(value)),
  logoUrl: text(500).refine((value) => value === "" || /^https:\/\/\S+$/.test(value)),
  vatEnabled: bool,
  vatRatePercent: z.coerce.number().min(0).max(100),
  vatBin: text(40).refine((value) => value === "" || /^[0-9-]{6,20}$/.test(value)),
  vatShowBreakdown: bool,
} satisfies Record<keyof StoreSettings, z.ZodType>;

export function parseStoreSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): StoreSettings {
  const result: Record<string, unknown> = { ...DEFAULT_STORE_SETTINGS };
  for (const field of Object.keys(storeSettingParsers) as Array<keyof StoreSettings>) {
    const value = raw.get(STORE_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = storeSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${STORE_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as StoreSettings;
}

/**
 * The VAT contained in a VAT-inclusive amount: amount × r / (100 + r),
 * rounded to the nearest poisha. Zero when VAT display is off.
 */
export function vatIncluded(amountPoisha: number, settings: StoreSettings): number {
  if (!settings.vatEnabled || settings.vatRatePercent <= 0) return 0;
  return Math.round((amountPoisha * settings.vatRatePercent) / (100 + settings.vatRatePercent));
}
