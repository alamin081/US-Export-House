import "server-only";

import { db } from "@/lib/db";

/** Delivery zones, the area-to-zone mapping and the Bangladesh address lists. */

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
} as const;

export type ZoneRow = Awaited<ReturnType<typeof findZones>>[number];

export async function findZones() {
  return db.shippingZone.findMany({ select: ZONE_SELECT, orderBy: { sortOrder: "asc" } });
}

export async function findDivisions() {
  return db.geoDivision.findMany({
    select: { id: true, nameEn: true, nameBn: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function findDistricts(divisionId: string) {
  return db.geoDistrict.findMany({
    where: { divisionId },
    select: { id: true, nameEn: true, nameBn: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function findUpazilas(districtId: string) {
  return db.geoUpazila.findMany({
    where: { districtId, isActive: true },
    select: { id: true, nameEn: true, nameBn: true, kind: true },
    // Metropolitan thanas first (Dhaka), then upazilas, each alphabetically.
    orderBy: [{ kind: "desc" }, { nameEn: "asc" }],
  });
}

/** An upazila with its district, division and the zone mapped at each level. */
export async function findAreaChain(upazilaId: string) {
  return db.geoUpazila.findUnique({
    where: { id: upazilaId },
    select: {
      id: true,
      nameEn: true,
      nameBn: true,
      isActive: true,
      zoneArea: { select: { zoneId: true } },
      district: {
        select: {
          id: true,
          nameEn: true,
          nameBn: true,
          zoneArea: { select: { zoneId: true } },
          division: { select: { id: true, nameEn: true, nameBn: true } },
        },
      },
    },
  });
}
