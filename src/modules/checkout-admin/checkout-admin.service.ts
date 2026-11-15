import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { parseTakaInput } from "@/lib/money";
import { assertPermission, hasPermission, type StaffContext } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { normalizeCouponCode } from "@/modules/checkout/coupon-rules";
import { maskBdMobile, normalizeBdMobile } from "@/modules/checkout/phone";
import {
  CHECKOUT_SETTING_KEYS,
  checkoutSettingParsers,
  type CheckoutSettings,
} from "@/modules/settings/checkout-settings";
import { getCheckoutSettings } from "@/modules/settings/settings.service";
import {
  areaExists,
  blockPhone,
  clearAreaMapping,
  countOtherActiveDefaults,
  createCoupon,
  deleteUnusedCoupon,
  findAreaMapping,
  findBlockedPhone,
  findBlockedPhoneById,
  findCoupon,
  findProductIdsBySlugs,
  findZone,
  isDuplicateCode,
  listBlockedPhones,
  listCategoryChoices,
  listCoupons,
  listZones,
  searchAreas,
  setAreaMapping,
  unblockPhone,
  updateCoupon,
  updateZone,
  upsertSettings,
  type CouponData,
  type ScopeData,
} from "./checkout-admin.repository";

/**
 * Admin side of Phase 8. Every write checks its permission here (the pages
 * and actions check too, but this is the line that counts) and is audited
 * with before/after values.
 */

function invalid(message: string, field?: string): AppError {
  return new AppError("VALIDATION_FAILED", message, {
    ...(field === undefined ? {} : { details: { field } }),
  });
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalid(issue?.message ?? "Check the form.", issue?.path.join("."));
  }
  return result.data;
}

const takaOrEmpty = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === "") return null;
      const poisha = parseTakaInput(value);
      if (poisha === null || poisha < 0) {
        context.addIssue({ code: "custom", message: `${label}: enter an amount in taka.` });
        return z.NEVER;
      }
      return poisha;
    });

const countOrEmpty = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === "") return null;
      const count = Number(value);
      if (!Number.isInteger(count) || count < 1 || count > 1_000_000) {
        context.addIssue({
          code: "custom",
          message: `${label}: enter a whole number of 1 or more.`,
        });
        return z.NEVER;
      }
      return count;
    });

/** `datetime-local` values are Bangladesh time (UTC+6, no daylight saving). */
const dhakaDateOrEmpty = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value === "") return null;
    const date = new Date(`${value.length === 16 ? `${value}:00` : value}+06:00`);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return z.NEVER;
    }
    return date;
  });

// ---------------------------------------------------------------------------
// coupons
// ---------------------------------------------------------------------------

const couponSchema = z.object({
  code: z
    .string()
    .transform(normalizeCouponCode)
    .pipe(z.string().regex(/^[A-Z0-9]{3,30}$/, "Code: 3 to 30 letters and digits.")),
  type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
  value: z.string().trim(),
  channel: z.enum(["ONLINE", "BOTH"]).default("ONLINE"),
  labelEn: z.string().trim().max(80).default(""),
  labelBn: z.string().trim().max(80).default(""),
  minSubtotal: takaOrEmpty("Minimum"),
  maxDiscount: takaOrEmpty("Maximum discount"),
  startsAt: dhakaDateOrEmpty,
  endsAt: dhakaDateOrEmpty,
  usageLimit: countOrEmpty("Total uses"),
  usageLimitPerCustomer: countOrEmpty("Uses per phone"),
  isActive: z.boolean(),
  includeCategoryIds: z.array(z.string().max(40)).max(100).default([]),
  excludeCategoryIds: z.array(z.string().max(40)).max(100).default([]),
  includeProductSlugs: z.string().max(2000).default(""),
  excludeProductSlugs: z.string().max(2000).default(""),
});

function couponValue(type: CouponData["type"], raw: string): number {
  if (type === "FREE_SHIPPING") return 0;
  if (type === "PERCENTAGE") {
    const percent = Number(raw);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw invalid("Percentage: a whole number from 1 to 100.", "value");
    }
    return percent;
  }
  const poisha = parseTakaInput(raw);
  if (poisha === null || poisha <= 0) throw invalid("Amount: enter taka above zero.", "value");
  return poisha;
}

function slugList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => slug !== ""),
    ),
  ];
}

async function couponInput(raw: unknown): Promise<{ data: CouponData; scopes: ScopeData[] }> {
  const input = parse(couponSchema, raw);
  if (input.startsAt !== null && input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw invalid("The end must be after the start.", "endsAt");
  }
  const includeSlugs = slugList(input.includeProductSlugs);
  const excludeSlugs = slugList(input.excludeProductSlugs);
  const products = await findProductIdsBySlugs([...includeSlugs, ...excludeSlugs]);
  const missing = [...includeSlugs, ...excludeSlugs].filter((slug) => !products.has(slug));
  if (missing.length > 0) {
    throw invalid(`Unknown product: ${missing.join(", ")}.`, "includeProductSlugs");
  }
  const scopes: ScopeData[] = [
    ...input.includeCategoryIds.map((categoryId) => ({
      mode: "INCLUDE" as const,
      categoryId,
      productId: null,
    })),
    ...input.excludeCategoryIds.map((categoryId) => ({
      mode: "EXCLUDE" as const,
      categoryId,
      productId: null,
    })),
    ...includeSlugs.map((slug) => ({
      mode: "INCLUDE" as const,
      categoryId: null,
      productId: products.get(slug)!,
    })),
    ...excludeSlugs.map((slug) => ({
      mode: "EXCLUDE" as const,
      categoryId: null,
      productId: products.get(slug)!,
    })),
  ];
  return {
    data: {
      code: input.code,
      type: input.type,
      value: couponValue(input.type, input.value),
      channel: input.channel,
      labelEn: input.labelEn === "" ? null : input.labelEn,
      labelBn: input.labelBn === "" ? null : input.labelBn,
      minSubtotalPoisha: input.minSubtotal,
      maxDiscountPoisha: input.type === "PERCENTAGE" ? input.maxDiscount : null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      usageLimitPerCustomer: input.usageLimitPerCustomer,
      isActive: input.isActive,
    },
    scopes,
  };
}

export async function listCouponsForStaff(staff: StaffContext) {
  assertPermission(staff, "coupon.manage");
  return listCoupons();
}

export async function getCouponForStaff(staff: StaffContext, id: string) {
  assertPermission(staff, "coupon.manage");
  const coupon = await findCoupon(id);
  if (coupon === null) throw new AppError("NOT_FOUND", "Coupon not found.");
  return coupon;
}

export async function listCouponCategoryChoices(staff: StaffContext) {
  assertPermission(staff, "coupon.manage");
  return listCategoryChoices();
}

export async function saveCoupon(
  staff: StaffContext,
  id: string | null,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "coupon.manage");
  const { data, scopes } = await couponInput(raw);
  const before = id === null ? null : await findCoupon(id);
  if (id !== null && before === null) throw new AppError("NOT_FOUND", "Coupon not found.");
  if (before !== null && before.usedCount > 0 && before.code !== data.code) {
    throw invalid("A coupon that has been used keeps its code.", "code");
  }
  try {
    const saved =
      id === null
        ? await createCoupon(data, scopes, staff.userId)
        : await updateCoupon(id, data, scopes);
    await recordAudit({
      actorUserId: staff.userId,
      action: id === null ? AUDIT_ACTIONS.couponCreated : AUDIT_ACTIONS.couponUpdated,
      entityType: "Coupon",
      entityId: saved.id,
      before,
      after: saved,
      meta,
    });
    return saved;
  } catch (error) {
    if (isDuplicateCode(error)) throw invalid("Another coupon already has this code.", "code");
    throw error;
  }
}

export async function deleteCoupon(staff: StaffContext, id: string, meta: RequestMeta) {
  assertPermission(staff, "coupon.manage");
  const before = await findCoupon(id);
  if (before === null) throw new AppError("NOT_FOUND", "Coupon not found.");
  if (!(await deleteUnusedCoupon(id))) {
    throw new AppError(
      "CONFLICT",
      "This coupon has been used, so it cannot be deleted. Turn it off instead.",
    );
  }
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.couponDeleted,
    entityType: "Coupon",
    entityId: id,
    before,
    meta,
  });
}

// ---------------------------------------------------------------------------
// delivery zones and areas
// ---------------------------------------------------------------------------

const zoneSchema = z.object({
  nameEn: z.string().trim().min(2).max(60),
  nameBn: z.string().trim().max(60).default(""),
  rate: z.string().trim(),
  freeThreshold: takaOrEmpty("Free delivery from"),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export async function getShippingOverview(staff: StaffContext) {
  assertPermission(staff, "shipping.manage");
  const [zones, settings] = await Promise.all([listZones(), getCheckoutSettings()]);
  return { zones, freeShippingThresholdPoisha: settings.freeShippingThresholdPoisha };
}

export async function saveZone(staff: StaffContext, id: string, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "shipping.manage");
  const input = parse(zoneSchema, raw);
  const rate = parseTakaInput(input.rate);
  if (rate === null || rate < 0) throw invalid("Rate: enter an amount in taka.", "rate");
  const before = await findZone(id);
  if (before === null) throw new AppError("NOT_FOUND", "Zone not found.");
  if (!input.isDefault || !input.isActive) {
    // There must always be one active fallback zone for unmapped areas.
    if (before.isDefault && (await countOtherActiveDefaults(id)) === 0) {
      throw invalid(
        "This is the fallback zone for unmapped areas. Make another zone the fallback first.",
        "isDefault",
      );
    }
  }
  const saved = await updateZone(id, {
    nameEn: input.nameEn,
    nameBn: input.nameBn === "" ? null : input.nameBn,
    ratePoisha: rate,
    freeThresholdPoisha: input.freeThreshold,
    isActive: input.isActive,
    isDefault: input.isDefault,
    sortOrder: input.sortOrder,
  });
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.shippingZoneUpdated,
    entityType: "ShippingZone",
    entityId: id,
    before,
    after: saved,
    meta,
  });
  return saved;
}

export async function searchShippingAreas(staff: StaffContext, text: string) {
  assertPermission(staff, "shipping.manage");
  const query = text.trim().slice(0, 60);
  if (query.length < 2) return { districts: [], upazilas: [] };
  return searchAreas(query, 30);
}

const mappingSchema = z.object({
  level: z.enum(["district", "upazila"]),
  areaId: z.string().regex(/^(dist-\d{2}|upz-[\w-]+|dhk-metro-\d{2})$/),
  /** Empty: remove the area's own mapping (it then follows its district / the fallback). */
  zoneId: z.string().max(40),
});

export async function mapArea(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "shipping.manage");
  const input = parse(mappingSchema, raw);
  const target =
    input.level === "district" ? { districtId: input.areaId } : { upazilaId: input.areaId };
  if (!(await areaExists(target))) throw new AppError("NOT_FOUND", "Area not found.");
  const before = await findAreaMapping(target);
  if (input.zoneId === "") {
    await clearAreaMapping(target);
  } else {
    if ((await findZone(input.zoneId)) === null) throw invalid("Unknown zone.", "zoneId");
    await setAreaMapping(target, input.zoneId);
  }
  await recordAudit({
    actorUserId: staff.userId,
    action:
      input.zoneId === "" ? AUDIT_ACTIONS.shippingAreaUnmapped : AUDIT_ACTIONS.shippingAreaMapped,
    entityType: "ShippingZoneArea",
    entityId: input.areaId,
    before: { zoneId: before?.zoneId ?? null },
    after: { zoneId: input.zoneId === "" ? null : input.zoneId },
    meta,
  });
}

// ---------------------------------------------------------------------------
// checkout settings (and the free-delivery threshold)
// ---------------------------------------------------------------------------

type SettingField = keyof CheckoutSettings;

/** Labels for the settings page and the audit trail. */
export const CHECKOUT_SETTING_LABELS: Record<SettingField, string> = {
  freeShippingThresholdPoisha: "Free delivery from (taka, after the coupon)",
  couponOnSaleItems: "Coupons also discount sale items",
  maxQtyPerVariant: "Most of one item per order",
  maxItemsPerOrder: "Most items per order",
  codMaxTotalPoisha: "Largest cash-on-delivery total (taka)",
  cartTtlDays: "Keep guest carts for (days)",
  maxOpenOrdersPerPhone: "Open orders per phone in 24 hours",
  maxOrdersPerIpPerHour: "Orders per IP address per hour",
  duplicateWindowMinutes: "Same order again within (minutes) is a duplicate",
  minFillSeconds: "Fastest believable checkout (seconds)",
  reviewItemsAtLeast: "Flag for review from this many items",
  reviewFirstOrderAtLeastPoisha: "Flag a first order from (taka)",
  couponAttemptsPer15Min: "Wrong coupon tries per IP per 15 minutes",
  trackAttemptsPer15Min: "Tracking tries per IP per 15 minutes",
  storeContactPhone: "Shop phone shown to customers",
  orderNumberPrefix: "Order number prefix",
};

const MONEY_FIELDS: ReadonlySet<SettingField> = new Set([
  "freeShippingThresholdPoisha",
  "codMaxTotalPoisha",
  "reviewFirstOrderAtLeastPoisha",
]);

export function isMoneySetting(field: SettingField): boolean {
  return MONEY_FIELDS.has(field);
}

export async function getCheckoutSettingsForStaff(staff: StaffContext) {
  assertPermission(staff, "checkout.settings");
  return getCheckoutSettings();
}

/**
 * Saves the given fields (as typed in the form: taka for money). The
 * shipping page may save only the free-delivery threshold (shipping.manage).
 */
export async function saveCheckoutSettings(
  staff: StaffContext,
  raw: Record<string, unknown>,
  meta: RequestMeta,
) {
  const fields = Object.keys(raw) as SettingField[];
  const onlyThreshold = fields.length === 1 && fields[0] === "freeShippingThresholdPoisha";
  if (!(onlyThreshold && hasPermission(staff, "shipping.manage"))) {
    assertPermission(staff, "checkout.settings");
  }
  const before = await getCheckoutSettings();
  const rows: Parameters<typeof upsertSettings>[0][number][] = [];
  const after: Partial<Record<SettingField, unknown>> = {};
  for (const field of fields) {
    if (!(field in CHECKOUT_SETTING_KEYS)) throw invalid(`Unknown setting ${field}.`);
    let text = String(raw[field] ?? "").trim();
    if (MONEY_FIELDS.has(field)) {
      const poisha = parseTakaInput(text);
      if (poisha === null) throw invalid(`${CHECKOUT_SETTING_LABELS[field]}: enter taka.`, field);
      text = String(poisha);
    }
    const parsed = checkoutSettingParsers[field].safeParse(text);
    if (!parsed.success)
      throw invalid(`${CHECKOUT_SETTING_LABELS[field]}: not a valid value.`, field);
    after[field] = parsed.data;
    rows.push({
      key: CHECKOUT_SETTING_KEYS[field],
      value: String(parsed.data),
      valueType:
        typeof parsed.data === "boolean"
          ? "BOOLEAN"
          : typeof parsed.data === "number"
            ? "INT"
            : "STRING",
      group: field === "freeShippingThresholdPoisha" ? "shipping" : "checkout",
      labelEn: CHECKOUT_SETTING_LABELS[field],
    });
  }
  const changed = rows.filter((row, index) => String(before[fields[index]!]) !== row.value);
  if (changed.length === 0) return;
  await upsertSettings(changed, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.checkoutSettingsChanged,
    entityType: "Setting",
    entityId: changed.map((row) => row.key).join(","),
    before: Object.fromEntries(fields.map((field) => [field, before[field]])),
    after,
    meta,
  });
}

// ---------------------------------------------------------------------------
// blocked phones
// ---------------------------------------------------------------------------

export async function listBlockedPhonesForStaff(staff: StaffContext) {
  assertPermission(staff, "customer.block");
  const showFull = hasPermission(staff, "customer.read");
  return (await listBlockedPhones()).map((row) => ({
    ...row,
    phone: showFull ? row.phone : maskBdMobile(row.phone),
  }));
}

const blockSchema = z.object({
  phone: z.string().max(30),
  reason: z.string().trim().min(3, "Write a short reason.").max(200),
});

export async function blockCustomerPhone(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "customer.block");
  const input = parse(blockSchema, raw);
  const phone = normalizeBdMobile(input.phone);
  if (!phone.ok) throw invalid("Enter a Bangladeshi mobile number.", "phone");
  const existing = await findBlockedPhone(phone.phone);
  if (existing !== null && existing.unblockedAt === null) {
    throw invalid("This number is already blocked.", "phone");
  }
  const saved = await blockPhone(phone.phone, input.reason, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.phoneBlocked,
    entityType: "BlockedPhone",
    entityId: saved.id,
    after: { phone: maskBdMobile(phone.phone), reason: input.reason },
    meta,
  });
}

export async function unblockCustomerPhone(staff: StaffContext, id: string, meta: RequestMeta) {
  assertPermission(staff, "customer.block");
  const row = await findBlockedPhoneById(id);
  if (row === null) throw new AppError("NOT_FOUND", "Not found.");
  if (!(await unblockPhone(id, staff.userId))) throw invalid("This number is not blocked.");
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.phoneUnblocked,
    entityType: "BlockedPhone",
    entityId: id,
    before: { phone: maskBdMobile(row.phone) },
    meta,
  });
}
