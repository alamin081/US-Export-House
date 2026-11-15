import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES, type PermissionKey } from "@/modules/access/permissions";
import {
  blockCustomerPhone,
  deleteCoupon,
  listBlockedPhonesForStaff,
  mapArea,
  saveCheckoutSettings,
  saveCoupon,
  saveZone,
  unblockCustomerPhone,
} from "@/modules/checkout-admin/checkout-admin.service";
import { resolveDeliveryArea } from "@/modules/shipping/shipping.service";

/**
 * Phase 8 admin against the real test database: permissions, coupon rules
 * (used coupons are kept), the fallback-zone guard, area mapping, blocked
 * phones, checkout settings and the masked phone on the order list. Every
 * change must leave an audit row. Records carry a per-run prefix; settings
 * and mappings changed here are put back.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const META = { ip: "198.51.100.20", userAgent: "checkout-admin-it" };
let counter = 0;

async function actor(
  roleName: string,
  permissions?: readonly PermissionKey[],
): Promise<StaffContext> {
  const definition = SYSTEM_ROLES.find((role) => role.name === roleName);
  if (definition === undefined) throw new Error(roleName);
  const role = await db.role.findFirstOrThrow({ where: { name: roleName } });
  const user = await db.user.create({
    data: {
      kind: "STAFF",
      email: `co-admin-${RUN.toLowerCase()}-${(counter += 1)}@test.local`,
      name: `${roleName} ${counter}`,
      roleId: role.id,
    },
  });
  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name,
    roleId: role.id,
    roleName,
    permissions: [...(permissions ?? definition.permissions)],
    allLocations: definition.allLocations,
    locationIds: [],
    sessionId: "integration",
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

async function caught(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected an error");
}

async function auditCount(action: string, since: Date) {
  return db.auditLog.count({ where: { action, createdAt: { gte: since } } });
}

const coupon = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  type: "FIXED",
  value: "100",
  labelEn: "",
  labelBn: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  usageLimitPerCustomer: "",
  isActive: true,
  ...extra,
});

let manager: StaffContext;
let orderStaff: StaffContext;
const settingsBefore = new Map<string, string | null>();

beforeAll(async () => {
  manager = await actor("Store Manager");
  orderStaff = await actor("Order Staff");
  for (const key of ["checkout.maxOrdersPerIpPerHour", "shipping.freeThresholdPoisha"]) {
    settingsBefore.set(key, (await db.setting.findUnique({ where: { key } }))?.value ?? null);
  }
});

afterAll(async () => {
  for (const [key, value] of settingsBefore) {
    if (value === null) await db.setting.deleteMany({ where: { key } });
    else await db.setting.update({ where: { key }, data: { value } });
  }
  await db.$disconnect();
});

describe("permissions", () => {
  it("Order Staff cannot manage coupons, zones or checkout settings, but may block phones", async () => {
    expect((await caught(saveCoupon(orderStaff, null, coupon(`NO${RUN}`), META))).code).toBe(
      "FORBIDDEN",
    );
    const zone = await db.shippingZone.findFirstOrThrow();
    expect((await caught(saveZone(orderStaff, zone.id, {}, META))).code).toBe("FORBIDDEN");
    expect(
      (await caught(saveCheckoutSettings(orderStaff, { minFillSeconds: "5" }, META))).code,
    ).toBe("FORBIDDEN");
    await expect(listBlockedPhonesForStaff(orderStaff)).resolves.toBeInstanceOf(Array);
  });
});

describe("coupons", () => {
  it("creates with a normalised code, refuses a duplicate in any case, and audits", async () => {
    const since = new Date();
    const saved = await saveCoupon(manager, null, coupon(` eid${RUN.toLowerCase()} `), META);
    expect(saved.code).toBe(`EID${RUN}`);
    expect(saved.value).toBe(10_000); // ৳100 in poisha
    const duplicate = await caught(
      saveCoupon(manager, null, coupon(`eid${RUN.toLowerCase()}`), META),
    );
    expect(duplicate.message).toContain("already has this code");
    expect(await auditCount("coupon.created", since)).toBe(1);
  });

  it("keeps a used coupon (no delete, no code change) and deletes an unused one", async () => {
    const used = await saveCoupon(manager, null, coupon(`USED${RUN}`), META);
    await db.coupon.update({ where: { id: used.id }, data: { usedCount: 1 } });
    expect((await caught(deleteCoupon(manager, used.id, META))).code).toBe("CONFLICT");
    const renamed = await caught(saveCoupon(manager, used.id, coupon(`OTHER${RUN}`), META));
    expect(renamed.message).toContain("keeps its code");

    const unused = await saveCoupon(manager, null, coupon(`GONE${RUN}`), META);
    const since = new Date();
    await deleteCoupon(manager, unused.id, META);
    expect(await db.coupon.findUnique({ where: { id: unused.id } })).toBeNull();
    expect(await auditCount("coupon.deleted", since)).toBe(1);
  });

  it("validates percentages, dates and product scopes", async () => {
    expect(
      (
        await caught(
          saveCoupon(manager, null, coupon(`P${RUN}`, { type: "PERCENTAGE", value: "150" }), META),
        )
      ).message,
    ).toContain("1 to 100");
    expect(
      (
        await caught(
          saveCoupon(
            manager,
            null,
            coupon(`D${RUN}`, { startsAt: "2026-12-10T10:00", endsAt: "2026-12-01T10:00" }),
            META,
          ),
        )
      ).message,
    ).toContain("after the start");
    expect(
      (
        await caught(
          saveCoupon(
            manager,
            null,
            coupon(`S${RUN}`, { includeProductSlugs: `nope-${RUN}` }),
            META,
          ),
        )
      ).message,
    ).toContain("Unknown product");
    const timed = await saveCoupon(
      manager,
      null,
      coupon(`T${RUN}`, { startsAt: "2026-12-01T09:00" }),
      META,
    );
    // Bangladesh time: 09:00 at UTC+6 is 03:00 UTC.
    expect(timed.startsAt?.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
});

describe("delivery zones", () => {
  it("keeps one active fallback zone", async () => {
    const fallback = await db.shippingZone.findFirstOrThrow({ where: { isDefault: true } });
    const error = await caught(
      saveZone(
        manager,
        fallback.id,
        {
          nameEn: fallback.nameEn,
          nameBn: fallback.nameBn ?? "",
          rate: String(fallback.ratePoisha / 100),
          freeThreshold: "",
          isActive: true,
          isDefault: false,
          sortOrder: String(fallback.sortOrder),
        },
        META,
      ),
    );
    expect(error.message).toContain("fallback");
  });

  it("maps an upazila to another zone, audits it, and the next quote follows; clearing restores", async () => {
    const savar = await db.geoUpazila.findUniqueOrThrow({
      where: { id: "upz-365" },
      include: { district: true, zoneArea: true },
    });
    const original = savar.zoneArea?.zoneId ?? "";
    const outside = await db.shippingZone.findUniqueOrThrow({ where: { code: "outside_dhaka" } });
    const area = {
      divisionId: savar.district.divisionId,
      districtId: savar.districtId,
      upazilaId: savar.id,
    };
    const since = new Date();
    try {
      await mapArea(manager, { level: "upazila", areaId: "upz-365", zoneId: outside.id }, META);
      expect((await resolveDeliveryArea(area))?.zone.code).toBe("outside_dhaka");
      await mapArea(manager, { level: "upazila", areaId: "upz-365", zoneId: "" }, META);
      // No own mapping: Dhaka district's (city).
      expect((await resolveDeliveryArea(area))?.zone.code).toBe("inside_dhaka");
      expect(await auditCount("shipping.area_mapped", since)).toBe(1);
      expect(await auditCount("shipping.area_unmapped", since)).toBe(1);
    } finally {
      await mapArea(manager, { level: "upazila", areaId: "upz-365", zoneId: original }, META);
    }
    expect((await resolveDeliveryArea(area))?.zone.code).toBe("dhaka_suburbs");
  });
});

describe("blocked phones and settings", () => {
  it("blocks once, unblocks with history, and keeps the audit free of the full number", async () => {
    const local = `0171${String(Date.now() % 10_000_000).padStart(7, "0")}`;
    const since = new Date();
    await blockCustomerPhone(orderStaff, { phone: local, reason: "fake orders" }, META);
    expect(
      (await caught(blockCustomerPhone(orderStaff, { phone: local, reason: "again" }, META)))
        .message,
    ).toContain("already blocked");
    const row = await db.blockedPhone.findUniqueOrThrow({ where: { phone: `+88${local}` } });
    await unblockCustomerPhone(orderStaff, row.id, META);
    expect(
      (await db.blockedPhone.findUniqueOrThrow({ where: { id: row.id } })).unblockedAt,
    ).not.toBeNull();
    const audits = await db.auditLog.findMany({
      where: {
        action: { in: ["customer.phone_blocked", "customer.phone_unblocked"] },
        createdAt: { gte: since },
      },
    });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(local.slice(3));
  });

  it("saves checkout settings with before/after in the audit, and shipping.manage may set only the threshold", async () => {
    const since = new Date();
    await saveCheckoutSettings(manager, { maxOrdersPerIpPerHour: "25" }, META);
    expect(
      (await db.setting.findUniqueOrThrow({ where: { key: "checkout.maxOrdersPerIpPerHour" } }))
        .value,
    ).toBe("25");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "checkout.settings_changed", createdAt: { gte: since } },
    });
    expect(audit.after).toMatchObject({ maxOrdersPerIpPerHour: 25 });

    const shippingOnly = await actor("Order Staff", ["shipping.manage"]);
    await saveCheckoutSettings(shippingOnly, { freeShippingThresholdPoisha: "3,000" }, META);
    expect(
      (await db.setting.findUniqueOrThrow({ where: { key: "shipping.freeThresholdPoisha" } }))
        .value,
    ).toBe("300000");
    expect(
      (await caught(saveCheckoutSettings(shippingOnly, { maxItemsPerOrder: "30" }, META))).code,
    ).toBe("FORBIDDEN");
  });

  it("creates the store contact phone row when it does not exist yet", async () => {
    const key = "store.contactPhone";
    const previous = await db.setting.findUnique({ where: { key } });
    await db.setting.deleteMany({ where: { key } });
    try {
      await saveCheckoutSettings(manager, { storeContactPhone: "+880 1711-000000" }, META);
      const row = await db.setting.findUniqueOrThrow({ where: { key } });
      expect(row.value).toBe("+880 1711-000000");
      expect(row.updatedByUserId).toBe(manager.userId);
      expect(
        (await caught(saveCheckoutSettings(manager, { storeContactPhone: "call us" }, META))).code,
      ).toBe("VALIDATION_FAILED");
    } finally {
      await db.setting.deleteMany({ where: { key } });
      if (previous !== null) await db.setting.create({ data: previous });
    }
  });
});
