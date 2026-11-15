/**
 * Phase 6 seed data: catalogue settings and the option preset library.
 * Imported by prisma/seed.ts. Create-only: an existing setting or preset is
 * never changed, so values the business has edited are left alone.
 */
import {
  CATALOG_SETTING_KEYS,
  DEFAULT_CATALOG_SETTINGS,
} from "../src/modules/settings/catalog-settings";
import {
  CHECKOUT_SETTING_KEYS,
  DEFAULT_CHECKOUT_SETTINGS,
} from "../src/modules/settings/checkout-settings";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTING_KEYS,
} from "../src/modules/settings/inventory-settings";
import { DEFAULT_ORDER_SETTINGS, ORDER_SETTING_KEYS } from "../src/modules/settings/order-settings";
import {
  DEFAULT_RETURNS_SETTINGS,
  RETURNS_SETTING_KEYS,
} from "../src/modules/settings/returns-settings";

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

/**
 * Phase 7 inventory settings (new keys only; `inventory.lowStockDefaultThreshold`
 * already exists in the Phase 4 list and keeps its value).
 */
export const INVENTORY_SETTINGS = [
  {
    key: INVENTORY_SETTING_KEYS.fewLeftThreshold,
    valueType: "INT" as const,
    value: String(DEFAULT_INVENTORY_SETTINGS.fewLeftThreshold),
    group: "storefront",
    description: 'Storefront shows "Only a few left" at or below this many available online.',
    isPublic: true,
  },
  {
    key: INVENTORY_SETTING_KEYS.transferRequireApproval,
    valueType: "BOOLEAN" as const,
    value: String(DEFAULT_INVENTORY_SETTINGS.transferRequireApproval),
    group: "inventory",
    description: "Transfers need a Store Manager's approval before dispatch.",
  },
  {
    key: INVENTORY_SETTING_KEYS.importMaxRows,
    valueType: "INT" as const,
    value: String(DEFAULT_INVENTORY_SETTINGS.importMaxRows),
    group: "inventory",
    description: "Most rows one stock CSV may have.",
  },
  {
    key: INVENTORY_SETTING_KEYS.importMaxBytes,
    valueType: "INT" as const,
    value: String(DEFAULT_INVENTORY_SETTINGS.importMaxBytes),
    group: "inventory",
    description: "Largest stock CSV file, in bytes.",
  },
  {
    key: INVENTORY_SETTING_KEYS.adjustConfirmAbove,
    valueType: "INT" as const,
    value: String(DEFAULT_INVENTORY_SETTINGS.adjustConfirmAbove),
    group: "inventory",
    description: "Stock adjustments larger than this many units need a confirmation.",
  },
];

/** Phase 8 checkout settings (new keys only; all provisional, editable in the admin). */
export const CHECKOUT_SETTINGS = (
  [
    ["couponOnSaleItems", "BOOLEAN", "Coupons also discount items that are already on sale."],
    ["maxQtyPerVariant", "INT", "Most units of one size/colour in one order."],
    ["maxItemsPerOrder", "INT", "Most items in one order."],
    ["codMaxTotalPoisha", "INT", "Largest cash-on-delivery order total, in poisha."],
    ["cartTtlDays", "INT", "Days an untouched cart is kept."],
    ["maxOpenOrdersPerPhone", "INT", "Pending orders one phone may have in 24 hours."],
    ["maxOrdersPerIpPerHour", "INT", "Orders one IP address may place per hour."],
    [
      "duplicateWindowMinutes",
      "INT",
      "Same phone + same items within this many minutes = duplicate.",
    ],
    ["minFillSeconds", "INT", "Checkout forms submitted faster than this are refused (bots)."],
    ["reviewItemsAtLeast", "INT", "Orders with at least this many items get a Review badge."],
    [
      "reviewFirstOrderAtLeastPoisha",
      "INT",
      "A first order from a phone at or above this total gets a Review badge.",
    ],
    ["couponAttemptsPer15Min", "INT", "Coupon attempts per IP per 15 minutes."],
    ["trackAttemptsPer15Min", "INT", "Order-tracking lookups per IP per 15 minutes."],
  ] as const
).map(([field, valueType, description]) => ({
  key: CHECKOUT_SETTING_KEYS[field],
  valueType,
  value: String(DEFAULT_CHECKOUT_SETTINGS[field]),
  group: "checkout",
  description,
}));

/** Phase 9 order processing settings (new keys only; editable later in the admin). */
export const ORDER_SETTINGS = (
  [
    [
      "unreachableAfterAttempts",
      "INT",
      "Unanswered confirmation calls before an order is flagged unreachable (never auto-cancelled).",
    ],
    ["callRetryMinHours", "INT", "Hours between two call attempts that count separately."],
    ["couriers", "STRING", "Couriers offered when shipping (comma-separated keys)."],
    ["packingSlipSize", "STRING", "Packing slip paper size: A4 or A5."],
  ] as const
).map(([field, valueType, description]) => ({
  key: ORDER_SETTING_KEYS[field],
  valueType,
  value: Array.isArray(DEFAULT_ORDER_SETTINGS[field])
    ? (DEFAULT_ORDER_SETTINGS[field] as readonly string[]).join(",")
    : String(DEFAULT_ORDER_SETTINGS[field]),
  group: "orders",
  description,
}));

/**
 * Phase 9 return and refund settings (new keys only; windowDays, policyApproved
 * and the conditions already exist from Phase 4).
 */
export const RETURNS_SETTINGS = (
  [
    [
      "refundShippingOnFault",
      "BOOLEAN",
      "Refund the delivery charge when the item was defective or wrong.",
    ],
    ["exchangeShippingPaidBy", "STRING", "Who pays exchange delivery: CUSTOMER or SHOP."],
    ["requestsPer15Min", "INT", "Customer return requests per IP per 15 minutes."],
    ["maxPhotos", "INT", "Photos a customer may attach to a return request."],
    [
      "refundApprovalAbovePoisha",
      "INT",
      "Refunds above this (poisha) need a Store Manager's approval. Owner: ৳5,000.",
    ],
  ] as const
).map(([field, valueType, description]) => ({
  key: RETURNS_SETTING_KEYS[field],
  valueType,
  value: String(DEFAULT_RETURNS_SETTINGS[field]),
  group: field === "refundApprovalAbovePoisha" ? "refunds" : "returns",
  description,
}));
