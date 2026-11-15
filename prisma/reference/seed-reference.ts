/**
 * Reference data every environment needs (staging and production included):
 * Bangladesh's divisions, districts and upazilas (+ Dhaka Metropolitan
 * thanas), the three delivery zones and the default area-to-zone mapping.
 *
 * CREATE-ONLY: a row that already exists (by id or code) is never changed,
 * so values edited in the admin are safe. Used by `npm run db:seed-reference`
 * and by the local development seed.
 *
 * Source and licence: docs/ADDRESS_DATA.md.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PrismaClient } from "../../src/generated/prisma/client";

interface GeoFile {
  divisions: Array<{ id: string; nameEn: string; nameBn: string; bbsCode: string | null }>;
  districts: Array<{
    id: string;
    divisionId: string;
    nameEn: string;
    nameBn: string;
    bbsCode: string | null;
  }>;
  upazilas: Array<{
    id: string;
    districtId: string;
    kind: "UPAZILA" | "METRO_THANA";
    nameEn: string;
    nameBn: string;
    bbsCode: string | null;
  }>;
}

/** Provisional rates (owner decision 2026-11-15); editable in the admin. */
export const DEFAULT_ZONES = [
  {
    code: "inside_dhaka",
    nameEn: "Dhaka City",
    nameBn: "ঢাকা সিটি",
    ratePoisha: 7_000,
    isDefault: false,
    sortOrder: 0,
  },
  {
    code: "dhaka_suburbs",
    nameEn: "Around Dhaka",
    nameBn: "ঢাকার আশেপাশে",
    ratePoisha: 10_000,
    isDefault: false,
    sortOrder: 1,
  },
  // The fallback: any area without a mapping.
  {
    code: "outside_dhaka",
    nameEn: "Outside Dhaka",
    nameBn: "ঢাকার বাইরে",
    ratePoisha: 13_000,
    isDefault: true,
    sortOrder: 2,
  },
] as const;

const DHAKA_DISTRICT = "dist-47";
const SUBURB_DISTRICTS = ["dist-41", "dist-43"]; // Gazipur, Narayanganj

export interface ReferenceSeedResult {
  divisions: number;
  districts: number;
  upazilas: number;
  zones: number;
  mappings: number;
}

export async function seedReference(prisma: PrismaClient): Promise<ReferenceSeedResult> {
  const geo = JSON.parse(
    await readFile(join(process.cwd(), "prisma", "reference", "bd-geo.json"), "utf8"),
  ) as GeoFile;

  const divisions = await prisma.geoDivision.createMany({
    data: geo.divisions,
    skipDuplicates: true,
  });
  const districts = await prisma.geoDistrict.createMany({
    data: geo.districts,
    skipDuplicates: true,
  });
  const upazilas = await prisma.geoUpazila.createMany({ data: geo.upazilas, skipDuplicates: true });

  let zones = 0;
  for (const zone of DEFAULT_ZONES) {
    const existing = await prisma.shippingZone.findUnique({
      where: { code: zone.code },
      select: { id: true },
    });
    if (existing !== null) continue;
    // Never create a second default: only claim it when no zone has it yet.
    const hasDefault = (await prisma.shippingZone.count({ where: { isDefault: true } })) > 0;
    await prisma.shippingZone.create({
      data: { ...zone, isDefault: zone.isDefault && !hasDefault },
    });
    zones += 1;
  }

  const zoneId = async (code: string) =>
    (await prisma.shippingZone.findUnique({ where: { code }, select: { id: true } }))?.id ?? null;
  const city = await zoneId("inside_dhaka");
  const suburbs = await zoneId("dhaka_suburbs");

  const wanted: Array<{ zoneId: string; districtId?: string; upazilaId?: string }> = [];
  if (city !== null) {
    // Every Dhaka Metropolitan thana, and Dhaka district itself as the fallback,
    // so a thana missing from the list never pays more than the city rate.
    for (const area of geo.upazilas.filter((upazila) => upazila.kind === "METRO_THANA")) {
      wanted.push({ zoneId: city, upazilaId: area.id });
    }
    wanted.push({ zoneId: city, districtId: DHAKA_DISTRICT });
  }
  if (suburbs !== null) {
    // Dhaka district's own upazilas (Savar, Dhamrai, Keraniganj, Nawabganj, Dohar).
    for (const area of geo.upazilas.filter(
      (upazila) => upazila.kind === "UPAZILA" && upazila.districtId === DHAKA_DISTRICT,
    )) {
      wanted.push({ zoneId: suburbs, upazilaId: area.id });
    }
    for (const districtId of SUBURB_DISTRICTS) wanted.push({ zoneId: suburbs, districtId });
  }
  const mappings = await prisma.shippingZoneArea.createMany({ data: wanted, skipDuplicates: true });

  return {
    divisions: divisions.count,
    districts: districts.count,
    upazilas: upazilas.count,
    zones,
    mappings: mappings.count,
  };
}
