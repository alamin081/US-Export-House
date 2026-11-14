/**
 * Catalogue settings: the rules the owner wants configurable rather than
 * hardcoded. Stored as `Setting` rows; the values below are only the
 * fallbacks used when a row is missing or malformed (a bad row never breaks
 * the storefront, it logs a warning and falls back).
 */
import { z } from "zod";

import { DEFAULT_PRODUCT_CODE_PREFIX, DEFAULT_SKU_PATTERN } from "@/modules/catalog/sku";

export const fitSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,30}$/),
  en: z.string().min(1).max(40),
  bn: z.string().max(40).optional(),
});

export type FitOption = z.infer<typeof fitSchema>;

export type Numerals = "latin" | "bengali";

export interface CatalogSettings {
  skuPattern: string;
  productCodePrefix: string;
  maxCategoryDepth: number;
  fits: FitOption[];
  maxUploadBytes: number;
  maxImageEdgePx: number;
  numerals: Numerals;
}

export const DEFAULT_FITS: FitOption[] = [
  { key: "slim", en: "Slim", bn: "স্লিম" },
  { key: "regular", en: "Regular", bn: "রেগুলার" },
  { key: "relaxed", en: "Relaxed", bn: "রিল্যাক্সড" },
  { key: "oversized", en: "Oversized", bn: "ওভারসাইজড" },
  { key: "comfort", en: "Comfort", bn: "কমফোর্ট" },
];

export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  skuPattern: DEFAULT_SKU_PATTERN,
  productCodePrefix: DEFAULT_PRODUCT_CODE_PREFIX,
  maxCategoryDepth: 3,
  fits: DEFAULT_FITS,
  maxUploadBytes: 8 * 1024 * 1024,
  maxImageEdgePx: 2400,
  numerals: "latin",
};

/** Setting keys, shared with the seed so both spell them the same way. */
export const CATALOG_SETTING_KEYS = {
  skuPattern: "catalog.skuPattern",
  productCodePrefix: "catalog.productCodePrefix",
  maxCategoryDepth: "catalog.maxCategoryDepth",
  fits: "catalog.fits",
  maxUploadBytes: "media.maxUploadBytes",
  maxImageEdgePx: "media.maxImageEdgePx",
  numerals: "storefront.numerals",
} as const;

const parsers = {
  skuPattern: z
    .string()
    .regex(/^[A-Z0-9{}_-]+$/)
    .refine((value) => value.includes("{PRODUCT_CODE}")),
  productCodePrefix: z.string().regex(/^[A-Z]{2,5}$/),
  maxCategoryDepth: z.coerce.number().int().min(1).max(6),
  fits: z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "not JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(fitSchema).min(1).max(30)),
  maxUploadBytes: z.coerce
    .number()
    .int()
    .min(100 * 1024)
    .max(20 * 1024 * 1024),
  maxImageEdgePx: z.coerce.number().int().min(400).max(8000),
  numerals: z.enum(["latin", "bengali"]),
} satisfies Record<keyof CatalogSettings, z.ZodType>;

/** Builds the settings from raw `Setting` rows (key -> value string). */
export function parseCatalogSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): CatalogSettings {
  const result: Record<string, unknown> = { ...DEFAULT_CATALOG_SETTINGS };
  for (const field of Object.keys(parsers) as Array<keyof CatalogSettings>) {
    const value = raw.get(CATALOG_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = parsers[field].safeParse(value);
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${CATALOG_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as CatalogSettings;
}
