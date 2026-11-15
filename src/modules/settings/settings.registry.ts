/**
 * Every setting the admin may change, in one list (Phase 12) — pure.
 *
 * The keys, defaults and validation come from the settings modules
 * (*-settings.ts), so this file only adds what the Settings page needs:
 * the group, the kind of input, labels and help in both languages, who may
 * edit it, and which storefront caches it feeds. A key that is not listed
 * here cannot be written from the Settings page. Secrets never live in
 * settings: they are environment variables (see the status group).
 */
import type { z } from "zod";

import type { PermissionKey } from "@/modules/access/permissions";
import {
  CATALOG_SETTING_KEYS,
  catalogSettingParsers,
  DEFAULT_CATALOG_SETTINGS,
} from "./catalog-settings";
import {
  CHECKOUT_SETTING_KEYS,
  checkoutSettingParsers,
  DEFAULT_CHECKOUT_SETTINGS,
} from "./checkout-settings";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTING_KEYS,
  inventorySettingParsers,
} from "./inventory-settings";
import {
  COURIER_KEYS,
  COURIER_LABELS,
  DEFAULT_ORDER_SETTINGS,
  ORDER_SETTING_KEYS,
  orderSettingParsers,
} from "./order-settings";
import { DEFAULT_POS_SETTINGS, POS_SETTING_KEYS, posSettingParsers } from "./pos-settings";
import {
  DEFAULT_REPORT_SETTINGS,
  REPORT_SETTING_KEYS,
  reportSettingParsers,
} from "./report-settings";
import {
  DEFAULT_RETURNS_SETTINGS,
  RETURNS_SETTING_KEYS,
  returnsSettingParsers,
} from "./returns-settings";
import {
  DEFAULT_SITE_SETTINGS,
  PAYMENT_METHOD_KEYS,
  PAYMENT_METHOD_LABELS,
  SITE_SETTING_KEYS,
  siteSettingParsers,
} from "./site-settings";
import { DEFAULT_STORE_SETTINGS, STORE_SETTING_KEYS, storeSettingParsers } from "./store-settings";

export const SETTING_GROUPS = [
  { key: "store", label: "Store information", bn: "দোকানের তথ্য" },
  { key: "tax", label: "VAT on invoices", bn: "ভ্যাট" },
  { key: "checkout", label: "Checkout and fake orders", bn: "চেকআউট ও ভুয়া অর্ডার" },
  { key: "delivery", label: "Delivery", bn: "ডেলিভারি" },
  { key: "orders", label: "Orders and calls", bn: "অর্ডার ও কল" },
  { key: "returns", label: "Returns and refunds", bn: "রিটার্ন ও রিফান্ড" },
  { key: "pos", label: "Till (POS)", bn: "দোকানের ক্যাশ" },
  { key: "labels", label: "Labels and printing", bn: "লেবেল ও প্রিন্ট" },
  { key: "inventory", label: "Inventory", bn: "ইনভেন্টরি" },
  { key: "catalog", label: "Catalogue and images", bn: "ক্যাটালগ ও ছবি" },
  { key: "storefront", label: "Storefront", bn: "স্টোরফ্রন্ট" },
  { key: "reports", label: "Dashboard and reports", bn: "ড্যাশবোর্ড ও রিপোর্ট" },
  { key: "seo", label: "SEO and social", bn: "SEO ও সোশ্যাল" },
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number]["key"];

export type SettingKind =
  "money" | "int" | "percent" | "bool" | "text" | "textarea" | "enum" | "multi" | "json";

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  kind: SettingKind;
  /** Validates the stored string (money is stored in poisha). */
  parser: z.ZodType;
  /** The default as stored text. */
  defaultValue: string;
  label: { en: string; bn: string };
  help: { en: string; bn: string };
  unit?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** How a "multi" list is stored: comma-separated or a JSON array. */
  listFormat?: "csv" | "json";
  /** Any one of these lets a staff member edit it. */
  permissions: readonly PermissionKey[];
  /** Cache tags to refresh after a change. */
  tags: readonly string[];
  /** Edited on another screen; shown read-only here with a link. */
  editedAt?: { href: string; label: string };
}

/** The chosen values of a "multi" setting from its stored text. */
export function listValues(
  definition: Pick<SettingDefinition, "listFormat">,
  stored: string,
): string[] {
  if (definition.listFormat === "csv")
    return stored
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Stored text for a value (lists and maps as JSON). */
export function toStored(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

const SETTINGS = ["settings.write"] as const satisfies readonly PermissionKey[];
const CHECKOUT = [
  "settings.write",
  "checkout.settings",
] as const satisfies readonly PermissionKey[];
/** Owner decision: store details and SEO/social links are content too. */
const STORE = [
  "settings.write",
  "checkout.settings",
  "content.write",
] as const satisfies readonly PermissionKey[];
const SEO = ["settings.write", "content.write"] as const satisfies readonly PermissionKey[];
const SETTINGS_TAG = "settings";

function entry(
  key: string,
  group: SettingGroup,
  kind: SettingKind,
  parser: z.ZodType,
  defaultValue: unknown,
  label: [string, string],
  help: [string, string],
  extra: Partial<
    Pick<SettingDefinition, "unit" | "options" | "permissions" | "tags" | "editedAt" | "listFormat">
  > = {},
): SettingDefinition {
  return {
    key,
    group,
    kind,
    parser,
    defaultValue:
      extra.listFormat === "csv" && Array.isArray(defaultValue)
        ? defaultValue.join(",")
        : toStored(defaultValue),
    ...(extra.listFormat === undefined ? {} : { listFormat: extra.listFormat }),
    label: { en: label[0], bn: label[1] },
    help: { en: help[0], bn: help[1] },
    permissions: extra.permissions ?? SETTINGS,
    tags: extra.tags ?? [SETTINGS_TAG],
    ...(extra.unit === undefined ? {} : { unit: extra.unit }),
    ...(extra.options === undefined ? {} : { options: extra.options }),
    ...(extra.editedAt === undefined ? {} : { editedAt: extra.editedAt }),
  };
}

const S = STORE_SETTING_KEYS;
const C = CHECKOUT_SETTING_KEYS;
const O = ORDER_SETTING_KEYS;
const R = RETURNS_SETTING_KEYS;
const P = POS_SETTING_KEYS;
const I = INVENTORY_SETTING_KEYS;
const K = CATALOG_SETTING_KEYS;
const RP = REPORT_SETTING_KEYS;
const SI = SITE_SETTING_KEYS;

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  // store information
  entry(
    S.nameEn,
    "store",
    "text",
    storeSettingParsers.nameEn,
    DEFAULT_STORE_SETTINGS.nameEn,
    ["Shop name (English)", "দোকানের নাম (ইংরেজি)"],
    ["On the footer, invoices, receipts and labels.", "ফুটার, ইনভয়েস, রসিদ ও লেবেলে দেখাবে।"],
    { permissions: STORE },
  ),
  entry(
    S.nameBn,
    "store",
    "text",
    storeSettingParsers.nameBn,
    DEFAULT_STORE_SETTINGS.nameBn,
    ["Shop name (Bengali)", "দোকানের নাম (বাংলা)"],
    ["Shown on the Bengali site and printouts.", "বাংলা সাইট ও প্রিন্টে দেখাবে।"],
    { permissions: STORE },
  ),
  entry(
    S.addressEn,
    "store",
    "textarea",
    storeSettingParsers.addressEn,
    DEFAULT_STORE_SETTINGS.addressEn,
    ["Head office address (English)", "প্রধান কার্যালয়ের ঠিকানা (ইংরেজি)"],
    ["Footer and invoices. Branch addresses are in Locations.", "শাখার ঠিকানা Locations-এ দিন।"],
    { permissions: STORE },
  ),
  entry(
    S.addressBn,
    "store",
    "textarea",
    storeSettingParsers.addressBn,
    DEFAULT_STORE_SETTINGS.addressBn,
    ["Head office address (Bengali)", "প্রধান কার্যালয়ের ঠিকানা (বাংলা)"],
    ["", ""],
    { permissions: STORE },
  ),
  entry(
    S.contactPhone,
    "store",
    "text",
    storeSettingParsers.contactPhone,
    DEFAULT_STORE_SETTINGS.contactPhone,
    ["Shop phone for customers", "কাস্টমারের জন্য ফোন নম্বর"],
    [
      "Footer, contact page, checkout messages and {storePhone} in content.",
      "ফুটার, যোগাযোগ পেজ ও চেকআউটে দেখাবে।",
    ],
    { permissions: STORE },
  ),
  entry(
    S.whatsapp,
    "store",
    "text",
    storeSettingParsers.whatsapp,
    DEFAULT_STORE_SETTINGS.whatsapp,
    ["WhatsApp number", "হোয়াটসঅ্যাপ নম্বর"],
    [
      "Digits with country code, e.g. 8801711000000. Adds a WhatsApp button.",
      "দেশের কোডসহ নম্বর, যেমন 8801711000000।",
    ],
    { permissions: STORE },
  ),
  entry(
    S.logoUrl,
    "store",
    "text",
    storeSettingParsers.logoUrl,
    DEFAULT_STORE_SETTINGS.logoUrl,
    ["Logo (https image address)", "লোগোর ঠিকানা"],
    [
      "Printed on invoices and receipts instead of the name.",
      "ইনভয়েস ও রসিদে নামের বদলে লোগো ছাপা হবে।",
    ],
    { permissions: STORE },
  ),

  // VAT
  entry(
    S.vatEnabled,
    "tax",
    "bool",
    storeSettingParsers.vatEnabled,
    DEFAULT_STORE_SETTINGS.vatEnabled,
    ["Show VAT details on invoices", "ইনভয়েসে ভ্যাটের তথ্য দেখাও"],
    [
      "Prices already include VAT; this only prints the details.",
      "দামে ভ্যাট আগেই আছে; এটা শুধু তথ্য ছাপায়।",
    ],
    { permissions: CHECKOUT },
  ),
  entry(
    S.vatRatePercent,
    "tax",
    "percent",
    storeSettingParsers.vatRatePercent,
    DEFAULT_STORE_SETTINGS.vatRatePercent,
    ["VAT rate", "ভ্যাটের হার"],
    ["", ""],
    { permissions: CHECKOUT, unit: "%" },
  ),
  entry(
    S.vatBin,
    "tax",
    "text",
    storeSettingParsers.vatBin,
    DEFAULT_STORE_SETTINGS.vatBin,
    ["BIN number", "বিআইএন নম্বর"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    S.vatShowBreakdown,
    "tax",
    "bool",
    storeSettingParsers.vatShowBreakdown,
    DEFAULT_STORE_SETTINGS.vatShowBreakdown,
    ["Show the VAT share in the total", "মোটের ভেতরে ভ্যাটের অংশ দেখাও"],
    ["", ""],
    { permissions: CHECKOUT },
  ),

  // checkout and fake orders
  entry(
    C.couponOnSaleItems,
    "checkout",
    "bool",
    checkoutSettingParsers.couponOnSaleItems,
    DEFAULT_CHECKOUT_SETTINGS.couponOnSaleItems,
    ["Coupons also discount sale items", "ছাড়ের পণ্যেও কুপন চলবে"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.maxQtyPerVariant,
    "checkout",
    "int",
    checkoutSettingParsers.maxQtyPerVariant,
    DEFAULT_CHECKOUT_SETTINGS.maxQtyPerVariant,
    ["Most of one item per order", "এক অর্ডারে একই পণ্য সর্বোচ্চ"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.maxItemsPerOrder,
    "checkout",
    "int",
    checkoutSettingParsers.maxItemsPerOrder,
    DEFAULT_CHECKOUT_SETTINGS.maxItemsPerOrder,
    ["Most items per order", "এক অর্ডারে সর্বোচ্চ পণ্য"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.codMaxTotalPoisha,
    "checkout",
    "money",
    checkoutSettingParsers.codMaxTotalPoisha,
    DEFAULT_CHECKOUT_SETTINGS.codMaxTotalPoisha,
    ["Largest cash-on-delivery total", "ক্যাশ অন ডেলিভারিতে সর্বোচ্চ অর্ডার"],
    ["Used as {codMaxTotal} in content.", "কনটেন্টে {codMaxTotal} হিসেবে বসে।"],
    { permissions: CHECKOUT },
  ),
  entry(
    C.cartTtlDays,
    "checkout",
    "int",
    checkoutSettingParsers.cartTtlDays,
    DEFAULT_CHECKOUT_SETTINGS.cartTtlDays,
    ["Keep guest carts for", "গেস্ট কার্ট রাখা হবে"],
    ["", ""],
    { permissions: CHECKOUT, unit: "days" },
  ),
  entry(
    C.maxOpenOrdersPerPhone,
    "checkout",
    "int",
    checkoutSettingParsers.maxOpenOrdersPerPhone,
    DEFAULT_CHECKOUT_SETTINGS.maxOpenOrdersPerPhone,
    ["Open orders per phone in 24 hours", "২৪ ঘণ্টায় এক ফোনে খোলা অর্ডার"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.maxOrdersPerIpPerHour,
    "checkout",
    "int",
    checkoutSettingParsers.maxOrdersPerIpPerHour,
    DEFAULT_CHECKOUT_SETTINGS.maxOrdersPerIpPerHour,
    ["Orders per IP address per hour", "ঘণ্টায় এক আইপি থেকে অর্ডার"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.duplicateWindowMinutes,
    "checkout",
    "int",
    checkoutSettingParsers.duplicateWindowMinutes,
    DEFAULT_CHECKOUT_SETTINGS.duplicateWindowMinutes,
    ["Same order again within … is a duplicate", "এর মধ্যে একই অর্ডার হলে ডুপ্লিকেট"],
    ["", ""],
    { permissions: CHECKOUT, unit: "minutes" },
  ),
  entry(
    C.minFillSeconds,
    "checkout",
    "int",
    checkoutSettingParsers.minFillSeconds,
    DEFAULT_CHECKOUT_SETTINGS.minFillSeconds,
    ["Fastest believable checkout", "সবচেয়ে দ্রুত বিশ্বাসযোগ্য চেকআউট"],
    ["Faster than this looks like a bot.", "এর চেয়ে দ্রুত হলে বট মনে হয়।"],
    { permissions: CHECKOUT, unit: "seconds" },
  ),
  entry(
    C.reviewItemsAtLeast,
    "checkout",
    "int",
    checkoutSettingParsers.reviewItemsAtLeast,
    DEFAULT_CHECKOUT_SETTINGS.reviewItemsAtLeast,
    ["Flag for review from this many items", "এত পণ্য হলে যাচাইয়ে পাঠাও"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.reviewFirstOrderAtLeastPoisha,
    "checkout",
    "money",
    checkoutSettingParsers.reviewFirstOrderAtLeastPoisha,
    DEFAULT_CHECKOUT_SETTINGS.reviewFirstOrderAtLeastPoisha,
    ["Flag a first order from", "প্রথম অর্ডার এত টাকার বেশি হলে যাচাই"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.couponAttemptsPer15Min,
    "checkout",
    "int",
    checkoutSettingParsers.couponAttemptsPer15Min,
    DEFAULT_CHECKOUT_SETTINGS.couponAttemptsPer15Min,
    ["Wrong coupon tries per IP per 15 minutes", "১৫ মিনিটে ভুল কুপনের চেষ্টা"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.trackAttemptsPer15Min,
    "checkout",
    "int",
    checkoutSettingParsers.trackAttemptsPer15Min,
    DEFAULT_CHECKOUT_SETTINGS.trackAttemptsPer15Min,
    ["Tracking tries per IP per 15 minutes", "১৫ মিনিটে ট্র্যাকিংয়ের চেষ্টা"],
    ["", ""],
    { permissions: CHECKOUT },
  ),
  entry(
    C.orderNumberPrefix,
    "checkout",
    "text",
    checkoutSettingParsers.orderNumberPrefix,
    DEFAULT_CHECKOUT_SETTINGS.orderNumberPrefix,
    ["Order number prefix", "অর্ডার নম্বরের শুরু"],
    ["Order numbers read PREFIX-YYMM-NNNNN.", "যেমন UEH-2611-00001।"],
    { permissions: CHECKOUT },
  ),

  // delivery
  entry(
    C.freeShippingThresholdPoisha,
    "delivery",
    "money",
    checkoutSettingParsers.freeShippingThresholdPoisha,
    DEFAULT_CHECKOUT_SETTINGS.freeShippingThresholdPoisha,
    ["Free delivery from", "এত টাকার বেশি হলে ফ্রি ডেলিভারি"],
    [
      "After the coupon. Used as {freeShippingThreshold} in content.",
      "কনটেন্টে {freeShippingThreshold} হিসেবে বসে।",
    ],
    { permissions: CHECKOUT, editedAt: { href: "/admin/shipping", label: "Delivery zones" } },
  ),
  entry(
    O.couriers,
    "delivery",
    "multi",
    orderSettingParsers.couriers,
    DEFAULT_ORDER_SETTINGS.couriers,
    ["Couriers offered when shipping", "পাঠানোর সময় কুরিয়ারের তালিকা"],
    ["", ""],
    {
      listFormat: "csv",
      options: COURIER_KEYS.map((key) => ({ value: key, label: COURIER_LABELS[key] })),
    },
  ),

  // orders and calls
  entry(
    O.unreachableAfterAttempts,
    "orders",
    "int",
    orderSettingParsers.unreachableAfterAttempts,
    DEFAULT_ORDER_SETTINGS.unreachableAfterAttempts,
    ["Unreachable after this many unanswered calls", "এতবার ফোন না ধরলে অপ্রাপ্য"],
    ["Never cancels automatically.", "নিজে থেকে বাতিল হয় না।"],
  ),
  entry(
    O.callRetryMinHours,
    "orders",
    "int",
    orderSettingParsers.callRetryMinHours,
    DEFAULT_ORDER_SETTINGS.callRetryMinHours,
    ["Hours between counted calls", "দুই কলের মাঝে ঘণ্টা"],
    ["", ""],
    { unit: "hours" },
  ),
  entry(
    O.packingSlipSize,
    "labels",
    "enum",
    orderSettingParsers.packingSlipSize,
    DEFAULT_ORDER_SETTINGS.packingSlipSize,
    ["Packing slip paper", "প্যাকিং স্লিপের কাগজ"],
    ["", ""],
    {
      options: [
        { value: "A4", label: "A4" },
        { value: "A5", label: "A5" },
      ],
    },
  ),

  // returns and refunds
  entry(
    R.windowDays,
    "returns",
    "int",
    returnsSettingParsers.windowDays,
    DEFAULT_RETURNS_SETTINGS.windowDays,
    ["Days to ask for a return", "রিটার্নের সময়সীমা"],
    ["Counted from delivery. Used as {returnWindowDays} in content.", "ডেলিভারি থেকে গোনা হয়।"],
    { unit: "days" },
  ),
  entry(
    R.refundShippingOnFault,
    "returns",
    "bool",
    returnsSettingParsers.refundShippingOnFault,
    DEFAULT_RETURNS_SETTINGS.refundShippingOnFault,
    ["Refund delivery when it is our fault", "আমাদের ভুলে ডেলিভারি চার্জ ফেরত"],
    ["", ""],
  ),
  entry(
    R.exchangeShippingPaidBy,
    "returns",
    "enum",
    returnsSettingParsers.exchangeShippingPaidBy,
    DEFAULT_RETURNS_SETTINGS.exchangeShippingPaidBy,
    ["Exchange delivery is paid by", "এক্সচেঞ্জের ডেলিভারি চার্জ দেবে"],
    ["", ""],
    {
      options: [
        { value: "CUSTOMER", label: "The customer" },
        { value: "SHOP", label: "The shop" },
      ],
    },
  ),
  entry(
    R.requestsPer15Min,
    "returns",
    "int",
    returnsSettingParsers.requestsPer15Min,
    DEFAULT_RETURNS_SETTINGS.requestsPer15Min,
    ["Customer return requests per 15 minutes", "১৫ মিনিটে রিটার্নের অনুরোধ"],
    ["", ""],
  ),
  entry(
    R.maxPhotos,
    "returns",
    "int",
    returnsSettingParsers.maxPhotos,
    DEFAULT_RETURNS_SETTINGS.maxPhotos,
    ["Photos per return request", "রিটার্নে সর্বোচ্চ ছবি"],
    ["", ""],
  ),
  entry(
    R.refundApprovalAbovePoisha,
    "returns",
    "money",
    returnsSettingParsers.refundApprovalAbovePoisha,
    DEFAULT_RETURNS_SETTINGS.refundApprovalAbovePoisha,
    ["Refunds above this need approval", "এর বেশি রিফান্ডে অনুমোদন লাগবে"],
    ["", ""],
  ),
  entry(
    R.conditionsEn,
    "returns",
    "textarea",
    returnsSettingParsers.conditionsEn,
    DEFAULT_RETURNS_SETTINGS.conditionsEn,
    ["Return conditions (English)", "রিটার্নের শর্ত (ইংরেজি)"],
    ["Shown on the customer's return form.", "কাস্টমারের রিটার্ন ফর্মে দেখাবে।"],
  ),
  entry(
    R.conditionsBn,
    "returns",
    "textarea",
    returnsSettingParsers.conditionsBn,
    DEFAULT_RETURNS_SETTINGS.conditionsBn,
    ["Return conditions (Bengali)", "রিটার্নের শর্ত (বাংলা)"],
    ["", ""],
  ),

  // till
  entry(
    P.maxDiscountPercentByRole,
    "pos",
    "json",
    posSettingParsers.maxDiscountPercentByRole,
    DEFAULT_POS_SETTINGS.maxDiscountPercentByRole,
    ["Largest till discount by role (%)", "রোল অনুযায়ী সর্বোচ্চ ছাড় (%)"],
    [
      'Example: {"Branch Sales Staff": 5, "Branch Manager": 15}. Roles not listed have no limit.',
      "তালিকায় না থাকা রোলের সীমা নেই।",
    ],
  ),
  entry(
    P.counters,
    "pos",
    "json",
    posSettingParsers.counters,
    DEFAULT_POS_SETTINGS.counters,
    ["Extra counters per branch", "শাখায় অতিরিক্ত কাউন্টার"],
    ['Example: {"BR-GUL": ["2"]}. Every branch has MAIN.', "প্রতিটি শাখায় MAIN থাকেই।"],
  ),
  entry(
    P.receiptWidthMm,
    "pos",
    "enum",
    posSettingParsers.receiptWidthMm,
    DEFAULT_POS_SETTINGS.receiptWidthMm,
    ["Receipt paper width", "রসিদের কাগজের প্রস্থ"],
    ["", ""],
    {
      options: [
        { value: "58", label: "58 mm" },
        { value: "80", label: "80 mm" },
      ],
    },
  ),
  entry(
    P.pinAttemptsPer15Min,
    "pos",
    "int",
    posSettingParsers.pinAttemptsPer15Min,
    DEFAULT_POS_SETTINGS.pinAttemptsPer15Min,
    ["Manager PIN tries per 15 minutes", "১৫ মিনিটে পিনের চেষ্টা"],
    ["", ""],
  ),
  entry(
    P.labelWidthMm,
    "labels",
    "int",
    posSettingParsers.labelWidthMm,
    DEFAULT_POS_SETTINGS.labelWidthMm,
    ["Barcode label width", "বারকোড লেবেলের প্রস্থ"],
    ["", ""],
    { unit: "mm" },
  ),
  entry(
    P.labelHeightMm,
    "labels",
    "int",
    posSettingParsers.labelHeightMm,
    DEFAULT_POS_SETTINGS.labelHeightMm,
    ["Barcode label height", "বারকোড লেবেলের উচ্চতা"],
    ["", ""],
    { unit: "mm" },
  ),

  // inventory
  entry(
    I.lowStockDefaultThreshold,
    "inventory",
    "int",
    inventorySettingParsers.lowStockDefaultThreshold,
    DEFAULT_INVENTORY_SETTINGS.lowStockDefaultThreshold,
    ["Low stock from (admin alert)", "এর কম হলে লো-স্টক"],
    ["", ""],
    { unit: "units" },
  ),
  entry(
    I.transferRequireApproval,
    "inventory",
    "bool",
    inventorySettingParsers.transferRequireApproval,
    DEFAULT_INVENTORY_SETTINGS.transferRequireApproval,
    ["Transfers need approval", "ট্রান্সফারে অনুমোদন লাগবে"],
    ["", ""],
  ),
  entry(
    I.importMaxRows,
    "inventory",
    "int",
    inventorySettingParsers.importMaxRows,
    DEFAULT_INVENTORY_SETTINGS.importMaxRows,
    ["Stock CSV: most rows", "স্টক CSV-তে সর্বোচ্চ সারি"],
    ["", ""],
  ),
  entry(
    I.importMaxBytes,
    "inventory",
    "int",
    inventorySettingParsers.importMaxBytes,
    DEFAULT_INVENTORY_SETTINGS.importMaxBytes,
    ["Stock CSV: largest file", "স্টক CSV-র সর্বোচ্চ আকার"],
    ["", ""],
    { unit: "bytes" },
  ),
  entry(
    I.adjustConfirmAbove,
    "inventory",
    "int",
    inventorySettingParsers.adjustConfirmAbove,
    DEFAULT_INVENTORY_SETTINGS.adjustConfirmAbove,
    ["Confirm adjustments above", "এর বেশি অ্যাডজাস্টমেন্টে নিশ্চিত করতে হবে"],
    ["", ""],
    { unit: "units" },
  ),

  // catalogue and images
  entry(
    K.skuPattern,
    "catalog",
    "text",
    catalogSettingParsers.skuPattern,
    DEFAULT_CATALOG_SETTINGS.skuPattern,
    ["SKU pattern", "SKU-র ধরন"],
    [
      "Must contain {PRODUCT_CODE}; {COLOUR} and {SIZE} are optional.",
      "{PRODUCT_CODE} থাকতেই হবে।",
    ],
  ),
  entry(
    K.productCodePrefix,
    "catalog",
    "text",
    catalogSettingParsers.productCodePrefix,
    DEFAULT_CATALOG_SETTINGS.productCodePrefix,
    ["Product code prefix", "প্রোডাক্ট কোডের শুরু"],
    ["2–5 capital letters.", "২–৫টি বড় হাতের অক্ষর।"],
  ),
  entry(
    K.maxCategoryDepth,
    "catalog",
    "int",
    catalogSettingParsers.maxCategoryDepth,
    DEFAULT_CATALOG_SETTINGS.maxCategoryDepth,
    ["Category levels", "ক্যাটাগরির স্তর"],
    ["", ""],
  ),
  entry(
    K.fits,
    "catalog",
    "json",
    catalogSettingParsers.fits,
    DEFAULT_CATALOG_SETTINGS.fits,
    ["Fits", "ফিট"],
    ['List of {"key", "en", "bn"}.', "ফিটের তালিকা।"],
    { tags: [SETTINGS_TAG, "settings"] },
  ),
  entry(
    K.maxUploadBytes,
    "catalog",
    "int",
    catalogSettingParsers.maxUploadBytes,
    DEFAULT_CATALOG_SETTINGS.maxUploadBytes,
    ["Largest image upload", "ছবির সর্বোচ্চ আকার"],
    ["", ""],
    { unit: "bytes" },
  ),
  entry(
    K.maxImageEdgePx,
    "catalog",
    "int",
    catalogSettingParsers.maxImageEdgePx,
    DEFAULT_CATALOG_SETTINGS.maxImageEdgePx,
    ["Images are shrunk to at most", "ছবি সর্বোচ্চ এত পিক্সেলে ছোট হবে"],
    ["", ""],
    { unit: "px" },
  ),

  // storefront
  entry(
    K.numerals,
    "storefront",
    "enum",
    catalogSettingParsers.numerals,
    DEFAULT_CATALOG_SETTINGS.numerals,
    ["Digits on the Bengali site", "বাংলা সাইটে অঙ্ক"],
    ["", ""],
    {
      options: [
        { value: "latin", label: "1 2 3 (Latin)" },
        { value: "bengali", label: "১ ২ ৩ (Bengali)" },
      ],
    },
  ),
  entry(
    I.fewLeftThreshold,
    "storefront",
    "int",
    inventorySettingParsers.fewLeftThreshold,
    DEFAULT_INVENTORY_SETTINGS.fewLeftThreshold,
    ["“Only a few left” at or below", "এর কম হলে “অল্প আছে”"],
    ["", ""],
    { unit: "units" },
  ),

  // dashboard and reports
  entry(
    RP.weekStartsOn,
    "reports",
    "enum",
    reportSettingParsers.weekStartsOn,
    DEFAULT_REPORT_SETTINGS.weekStartsOn,
    ["Report weeks start on", "রিপোর্টের সপ্তাহ শুরু"],
    ["", ""],
    {
      options: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
        (day, index) => ({ value: String(index), label: day }),
      ),
    },
  ),
  entry(
    RP.staleShipmentDays,
    "reports",
    "int",
    reportSettingParsers.staleShipmentDays,
    DEFAULT_REPORT_SETTINGS.staleShipmentDays,
    ["Shipped but not delivered after", "পাঠানোর পর এত দিনেও ডেলিভারি না হলে"],
    ["A dashboard task.", "ড্যাশবোর্ডের কাজের তালিকায় আসে।"],
    { unit: "days" },
  ),
  entry(
    RP.codOverdueDays,
    "reports",
    "int",
    reportSettingParsers.codOverdueDays,
    DEFAULT_REPORT_SETTINGS.codOverdueDays,
    ["COD not collected after", "এত দিনেও COD না পেলে"],
    ["A dashboard task.", "ড্যাশবোর্ডের কাজের তালিকায় আসে।"],
    { unit: "days" },
  ),
  entry(
    RP.bestSellerDays,
    "reports",
    "int",
    reportSettingParsers.bestSellerDays,
    DEFAULT_REPORT_SETTINGS.bestSellerDays,
    ["“Best selling” looks back", "“বেশি বিক্রি” গোনা হয়"],
    ["", ""],
    { unit: "days", tags: [SETTINGS_TAG, "reports:best-sellers"] },
  ),
  entry(
    RP.slowStockDays,
    "reports",
    "int",
    reportSettingParsers.slowStockDays,
    DEFAULT_REPORT_SETTINGS.slowStockDays,
    ["Slow stock: no sale for", "ধীরগতির মাল: এত দিন বিক্রি নেই"],
    ["", ""],
    { unit: "days" },
  ),

  // SEO and social
  entry(
    SI.facebookUrl,
    "seo",
    "text",
    siteSettingParsers.facebookUrl,
    DEFAULT_SITE_SETTINGS.facebookUrl,
    ["Facebook page", "ফেসবুক পেজ"],
    ["https://facebook.com/…", ""],
    { permissions: SEO },
  ),
  entry(
    SI.instagramUrl,
    "seo",
    "text",
    siteSettingParsers.instagramUrl,
    DEFAULT_SITE_SETTINGS.instagramUrl,
    ["Instagram", "ইনস্টাগ্রাম"],
    ["https://instagram.com/…", ""],
    { permissions: SEO },
  ),
  entry(
    SI.youtubeUrl,
    "seo",
    "text",
    siteSettingParsers.youtubeUrl,
    DEFAULT_SITE_SETTINGS.youtubeUrl,
    ["YouTube", "ইউটিউব"],
    ["https://youtube.com/…", ""],
    { permissions: SEO },
  ),
  entry(
    SI.tiktokUrl,
    "seo",
    "text",
    siteSettingParsers.tiktokUrl,
    DEFAULT_SITE_SETTINGS.tiktokUrl,
    ["TikTok", "টিকটক"],
    ["https://tiktok.com/@…", ""],
    { permissions: SEO },
  ),
  entry(
    SI.footerPaymentMethods,
    "seo",
    "multi",
    siteSettingParsers.footerPaymentMethods,
    DEFAULT_SITE_SETTINGS.footerPaymentMethods,
    ["Payment methods in the footer", "ফুটারে পেমেন্ট পদ্ধতি"],
    [
      "Cash on delivery only until online payment is live (Phase 10).",
      "অনলাইন পেমেন্ট চালু না হওয়া পর্যন্ত শুধু COD।",
    ],
    {
      permissions: SEO,
      listFormat: "json",
      options: PAYMENT_METHOD_KEYS.map((key) => ({
        value: key,
        label: PAYMENT_METHOD_LABELS[key].en,
      })),
    },
  ),
  entry(
    SI.defaultOgImageUrl,
    "seo",
    "text",
    siteSettingParsers.defaultOgImageUrl,
    DEFAULT_SITE_SETTINGS.defaultOgImageUrl,
    ["Default share picture (https)", "শেয়ারের ডিফল্ট ছবি"],
    ["Used when a page has no share picture of its own.", ""],
    { permissions: SEO },
  ),
];

/** Keys that still exist in the database but nothing reads; never shown or written. */
export const DEPRECATED_SETTING_KEYS = [
  "fulfillment.defaultLocationCode",
  "orders.numberPadding",
  "shipping.insideDhakaPoisha",
  "shipping.outsideDhakaPoisha",
  "returns.policyApproved",
] as const;

const BY_KEY = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

export function settingDefinition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}
