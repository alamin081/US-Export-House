import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Admin data access for Phase 8: coupons, delivery zones and their area
 * mapping, blocked phones, checkout settings and the read-only order list.
 */

// ---------------------------------------------------------------------------
// coupons
// ---------------------------------------------------------------------------

export interface CouponData {
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: number;
  channel: "ONLINE" | "BOTH";
  labelEn: string | null;
  labelBn: string | null;
  minSubtotalPoisha: number | null;
  maxDiscountPoisha: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  isActive: boolean;
}

export interface ScopeData {
  mode: "INCLUDE" | "EXCLUDE";
  categoryId: string | null;
  productId: string | null;
}

const COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  channel: true,
  labelEn: true,
  labelBn: true,
  minSubtotalPoisha: true,
  maxDiscountPoisha: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  usageLimitPerCustomer: true,
  usedCount: true,
  isActive: true,
  createdAt: true,
  scopes: {
    select: {
      mode: true,
      categoryId: true,
      productId: true,
      category: { select: { nameEn: true } },
      product: { select: { slug: true, nameEn: true } },
    },
  },
} as const;

export type CouponAdminRow = Prisma.CouponGetPayload<{ select: typeof COUPON_SELECT }>;

export async function listCoupons() {
  const [coupons, totals] = await Promise.all([
    db.coupon.findMany({
      where: { deletedAt: null },
      select: COUPON_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    db.couponRedemption.groupBy({
      by: ["couponId"],
      _sum: { discountPoisha: true },
      _count: { _all: true },
    }),
  ]);
  const byCoupon = new Map(totals.map((row) => [row.couponId, row]));
  return coupons.map((coupon) => ({
    ...coupon,
    orders: byCoupon.get(coupon.id)?._count._all ?? 0,
    discountGivenPoisha: byCoupon.get(coupon.id)?._sum.discountPoisha ?? 0,
  }));
}

export async function findCoupon(id: string) {
  return db.coupon.findFirst({ where: { id, deletedAt: null }, select: COUPON_SELECT });
}

export async function findProductIdsBySlugs(slugs: readonly string[]) {
  const rows = await db.product.findMany({
    where: { slug: { in: [...slugs] }, deletedAt: null },
    select: { id: true, slug: true },
  });
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export async function listCategoryChoices() {
  return db.category.findMany({
    where: { deletedAt: null },
    select: { id: true, nameEn: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
}

export async function createCoupon(data: CouponData, scopes: readonly ScopeData[], userId: string) {
  return db.coupon.create({
    data: { ...data, createdByUserId: userId, scopes: { create: [...scopes] } },
    select: COUPON_SELECT,
  });
}

export async function updateCoupon(id: string, data: CouponData, scopes: readonly ScopeData[]) {
  return db.$transaction(async (tx) => {
    await tx.couponScope.deleteMany({ where: { couponId: id } });
    return tx.coupon.update({
      where: { id },
      data: { ...data, scopes: { create: [...scopes] } },
      select: COUPON_SELECT,
    });
  });
}

/** Deletes a coupon that was never used; false when it has been. */
export async function deleteUnusedCoupon(id: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`;
    const used =
      (await tx.couponRedemption.count({ where: { couponId: id } })) > 0 ||
      (await tx.order.count({ where: { couponId: id } })) > 0 ||
      ((await tx.coupon.findUnique({ where: { id }, select: { usedCount: true } }))?.usedCount ??
        0) > 0;
    if (used) return false;
    await tx.coupon.delete({ where: { id } });
    return true;
  });
}

export function isDuplicateCode(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ---------------------------------------------------------------------------
// shipping zones and areas
// ---------------------------------------------------------------------------

const ZONE_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameBn: true,
  ratePoisha: true,
  freeThresholdPoisha: true,
  isDefault: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { areas: true } },
} as const;

export type ZoneAdminRow = Prisma.ShippingZoneGetPayload<{ select: typeof ZONE_SELECT }>;

export async function listZones() {
  return db.shippingZone.findMany({ select: ZONE_SELECT, orderBy: { sortOrder: "asc" } });
}

export async function findZone(id: string) {
  return db.shippingZone.findUnique({ where: { id }, select: ZONE_SELECT });
}

export async function updateZone(
  id: string,
  data: {
    nameEn: string;
    nameBn: string | null;
    ratePoisha: number;
    freeThresholdPoisha: number | null;
    isActive: boolean;
    isDefault: boolean;
    sortOrder: number;
  },
) {
  return db.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.shippingZone.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.shippingZone.update({ where: { id }, data, select: ZONE_SELECT });
  });
}

export async function countOtherActiveDefaults(id: string) {
  return db.shippingZone.count({ where: { isDefault: true, isActive: true, id: { not: id } } });
}

/** Districts and upazilas whose English or Bengali name contains the text. */
export async function searchAreas(text: string, limit: number) {
  const contains = { contains: text, mode: "insensitive" as const };
  const [districts, upazilas] = await Promise.all([
    db.geoDistrict.findMany({
      where: { OR: [{ nameEn: contains }, { nameBn: contains }] },
      select: {
        id: true,
        nameEn: true,
        nameBn: true,
        division: { select: { nameEn: true } },
        zoneArea: { select: { zoneId: true } },
      },
      orderBy: { nameEn: "asc" },
      take: limit,
    }),
    db.geoUpazila.findMany({
      where: { OR: [{ nameEn: contains }, { nameBn: contains }, { districtId: text }] },
      select: {
        id: true,
        nameEn: true,
        nameBn: true,
        kind: true,
        zoneArea: { select: { zoneId: true } },
        district: { select: { id: true, nameEn: true, zoneArea: { select: { zoneId: true } } } },
      },
      orderBy: { nameEn: "asc" },
      take: limit,
    }),
  ]);
  return { districts, upazilas };
}

export async function findAreaMapping(target: { districtId: string } | { upazilaId: string }) {
  return db.shippingZoneArea.findUnique({
    where:
      "districtId" in target ? { districtId: target.districtId } : { upazilaId: target.upazilaId },
    select: { id: true, zoneId: true },
  });
}

export async function areaExists(target: { districtId: string } | { upazilaId: string }) {
  return "districtId" in target
    ? (await db.geoDistrict.count({ where: { id: target.districtId } })) > 0
    : (await db.geoUpazila.count({ where: { id: target.upazilaId } })) > 0;
}

export async function setAreaMapping(
  target: { districtId: string } | { upazilaId: string },
  zoneId: string,
) {
  const where =
    "districtId" in target ? { districtId: target.districtId } : { upazilaId: target.upazilaId };
  await db.shippingZoneArea.upsert({
    where,
    create: { ...where, zoneId },
    update: { zoneId },
  });
}

export async function clearAreaMapping(target: { districtId: string } | { upazilaId: string }) {
  await db.shippingZoneArea.deleteMany({
    where:
      "districtId" in target ? { districtId: target.districtId } : { upazilaId: target.upazilaId },
  });
}

// ---------------------------------------------------------------------------
// blocked phones
// ---------------------------------------------------------------------------

export async function listBlockedPhones() {
  return db.blockedPhone.findMany({
    select: {
      id: true,
      phone: true,
      reason: true,
      createdAt: true,
      unblockedAt: true,
      blockedBy: { select: { name: true, email: true } },
      unblockedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ unblockedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 500,
  });
}

export async function findBlockedPhone(phone: string) {
  return db.blockedPhone.findUnique({ where: { phone }, select: { id: true, unblockedAt: true } });
}

/** Blocks (again): an earlier unblocked row is re-used. */
export async function blockPhone(phone: string, reason: string, userId: string) {
  return db.blockedPhone.upsert({
    where: { phone },
    create: { phone, reason, blockedByUserId: userId },
    update: { reason, blockedByUserId: userId, unblockedAt: null, unblockedByUserId: null },
    select: { id: true },
  });
}

export async function unblockPhone(id: string, userId: string) {
  const result = await db.blockedPhone.updateMany({
    where: { id, unblockedAt: null },
    data: { unblockedAt: new Date(), unblockedByUserId: userId },
  });
  return result.count === 1;
}

export async function findBlockedPhoneById(id: string) {
  return db.blockedPhone.findUnique({ where: { id }, select: { phone: true, unblockedAt: true } });
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export async function upsertSettings(
  rows: ReadonlyArray<{
    key: string;
    value: string;
    valueType: "STRING" | "INT" | "BOOLEAN";
    group: string;
    labelEn: string;
  }>,
  userId: string,
) {
  await db.$transaction(
    rows.map((row) =>
      db.setting.upsert({
        where: { key: row.key },
        create: { ...row, updatedByUserId: userId },
        update: { value: row.value, updatedByUserId: userId },
      }),
    ),
  );
}
