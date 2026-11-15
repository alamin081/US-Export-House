import "server-only";

import { unstable_cache } from "next/cache";

import { resolveZone } from "@/modules/checkout/checkout-rules";
import { getCheckoutSettings } from "@/modules/settings/settings.service";
import {
  findAreaChain,
  findDistricts,
  findDivisions,
  findUpazilas,
  findZones,
} from "./shipping.repository";

/**
 * Storefront side of delivery: the address lists and the zone an address
 * falls in. The customer never picks a zone; it follows from the upazila
 * (then the district, then the default zone).
 */

export const GEO_TAG = "geo";

/** The address lists change only with a data release: cached for a day. */
export const listDivisions = unstable_cache(findDivisions, ["geo-divisions"], {
  tags: [GEO_TAG],
  revalidate: 86_400,
});
export const listDistricts = unstable_cache(findDistricts, ["geo-districts"], {
  tags: [GEO_TAG],
  revalidate: 86_400,
});
export const listUpazilas = unstable_cache(findUpazilas, ["geo-upazilas"], {
  tags: [GEO_TAG],
  revalidate: 86_400,
});

export interface DeliveryZone {
  id: string;
  code: string;
  nameEn: string;
  nameBn: string | null;
  ratePoisha: number;
  /** The zone's own free-delivery threshold, else the global setting. */
  freeThresholdPoisha: number;
}

export interface DeliveryArea {
  divisionId: string;
  divisionName: { en: string; bn: string };
  districtId: string;
  districtName: { en: string; bn: string };
  upazilaId: string;
  upazilaName: { en: string; bn: string };
  zone: DeliveryZone;
}

/**
 * The full address chain and its zone, or null when the ids do not belong
 * together (a tampered form) or no zone is active. Read fresh: an admin
 * change to a rate applies to the very next quote.
 */
export async function resolveDeliveryArea(input: {
  divisionId: string;
  districtId: string;
  upazilaId: string;
}): Promise<DeliveryArea | null> {
  const [chain, zones, settings] = await Promise.all([
    findAreaChain(input.upazilaId),
    findZones(),
    getCheckoutSettings(),
  ]);
  if (
    chain === null ||
    !chain.isActive ||
    chain.district.id !== input.districtId ||
    chain.district.division.id !== input.divisionId
  ) {
    return null;
  }
  const zone = resolveZone({
    upazilaZoneId: chain.zoneArea?.zoneId ?? null,
    districtZoneId: chain.district.zoneArea?.zoneId ?? null,
    zones,
  });
  if (zone === null) return null;
  return {
    divisionId: chain.district.division.id,
    divisionName: { en: chain.district.division.nameEn, bn: chain.district.division.nameBn },
    districtId: chain.district.id,
    districtName: { en: chain.district.nameEn, bn: chain.district.nameBn },
    upazilaId: chain.id,
    upazilaName: { en: chain.nameEn, bn: chain.nameBn },
    zone: {
      id: zone.id,
      code: zone.code,
      nameEn: zone.nameEn,
      nameBn: zone.nameBn,
      ratePoisha: zone.ratePoisha,
      freeThresholdPoisha: zone.freeThresholdPoisha ?? settings.freeShippingThresholdPoisha,
    },
  };
}

/** Active zones and their rates, for "estimated delivery" on the cart page. */
export async function listZoneRates() {
  const zones = await findZones();
  return zones
    .filter((zone) => zone.isActive)
    .map((zone) => ({
      code: zone.code,
      nameEn: zone.nameEn,
      nameBn: zone.nameBn,
      ratePoisha: zone.ratePoisha,
    }));
}
