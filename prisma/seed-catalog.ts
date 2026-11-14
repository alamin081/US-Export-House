/**
 * Phase 6 seed data: catalogue settings and the option preset library.
 * Imported by prisma/seed.ts. Create-only: an existing setting or preset is
 * never changed, so values the business has edited are left alone.
 */
import {
  CATALOG_SETTING_KEYS,
  DEFAULT_CATALOG_SETTINGS,
} from "../src/modules/settings/catalog-settings";

export const CATALOG_SETTINGS = [
  {
    key: CATALOG_SETTING_KEYS.skuPattern,
    valueType: "STRING" as const,
    value: DEFAULT_CATALOG_SETTINGS.skuPattern,
    group: "catalog",
    description:
      "SKU pattern. Tokens: {PRODUCT_CODE}, {COLOUR}, {SIZE}. Capital letters, digits, hyphens.",
  },
  {
    key: CATALOG_SETTING_KEYS.productCodePrefix,
    valueType: "STRING" as const,
    value: DEFAULT_CATALOG_SETTINGS.productCodePrefix,
    group: "catalog",
    description: "Prefix of product codes, e.g. UEH -> UEH-SH0012.",
  },
  {
    key: CATALOG_SETTING_KEYS.maxCategoryDepth,
    valueType: "INT" as const,
    value: String(DEFAULT_CATALOG_SETTINGS.maxCategoryDepth),
    group: "catalog",
    description: "Maximum depth of the category tree (Men > Shirts > Formal shirts = 3).",
  },
  {
    key: CATALOG_SETTING_KEYS.fits,
    valueType: "JSON" as const,
    value: JSON.stringify(DEFAULT_CATALOG_SETTINGS.fits),
    group: "catalog",
    description: "Fits offered on the product form, in English and Bengali.",
  },
  {
    key: CATALOG_SETTING_KEYS.maxUploadBytes,
    valueType: "INT" as const,
    value: String(DEFAULT_CATALOG_SETTINGS.maxUploadBytes),
    group: "media",
    description: "Largest image upload accepted, in bytes (default 8 MB).",
  },
  {
    key: CATALOG_SETTING_KEYS.maxImageEdgePx,
    valueType: "INT" as const,
    value: String(DEFAULT_CATALOG_SETTINGS.maxImageEdgePx),
    group: "media",
    description: "Longest image side after the browser resizes it before upload, in pixels.",
  },
];

interface PresetSeed {
  type: "SIZE" | "COLOUR";
  group: string;
  code: string;
  valueEn: string;
  valueBn: string | null;
  hex: string | null;
}

const sizes = (group: string, values: ReadonlyArray<string>): PresetSeed[] =>
  values.map((value) => ({
    type: "SIZE",
    group,
    // SKU codes may not contain ".", so collar 15.5 becomes 155.
    code: value.replace(".", ""),
    valueEn: value,
    valueBn: null,
    hex: null,
  }));

/** Sizes and colours agreed for the Bangladesh menswear market (2026-11-14). */
export const OPTION_PRESETS: PresetSeed[] = [
  ...sizes("apparel", ["S", "M", "L", "XL", "XXL", "3XL"]),
  ...sizes("collar", ["15", "15.5", "16", "16.5", "17"]),
  ...sizes("waist", ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40"]),
  ...sizes("panjabi", ["38", "40", "42", "44", "46"]),
  {
    type: "COLOUR",
    group: "colour",
    code: "WHT",
    valueEn: "White",
    valueBn: "সাদা",
    hex: "#FFFFFF",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "BLK",
    valueEn: "Black",
    valueBn: "কালো",
    hex: "#1C1C1C",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "NVY",
    valueEn: "Navy Blue",
    valueBn: "নেভি ব্লু",
    hex: "#1F2A44",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "OWH",
    valueEn: "Off-White",
    valueBn: "অফ-হোয়াইট",
    hex: "#F4F0E6",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "MRN",
    valueEn: "Maroon",
    valueBn: "মেরুন",
    hex: "#6B1F2A",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "OLV",
    valueEn: "Olive",
    valueBn: "অলিভ",
    hex: "#6B6B3A",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "GRY",
    valueEn: "Grey",
    valueBn: "ধূসর",
    hex: "#8A8D91",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "SKY",
    valueEn: "Sky Blue",
    valueBn: "আকাশি",
    hex: "#9CC7E8",
  },
  {
    type: "COLOUR",
    group: "colour",
    code: "BGE",
    valueEn: "Beige",
    valueBn: "বেইজ",
    hex: "#D9C7A7",
  },
];
