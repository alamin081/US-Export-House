import { formatTakaInput } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getShippingOverview } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../page-guard";
import { AreaMapper, ThresholdForm, ZoneEditor } from "./shipping-forms";

export const metadata = { title: "Delivery zones" };

/**
 * Delivery zones and rates, the free-delivery threshold, and which zone each
 * district / upazila belongs to. Lookup: upazila -> district -> fallback zone.
 */
export default async function ShippingPage() {
  const staff = await requireStaffPage("shipping.manage");
  const overview = await forPage(getShippingOverview(staff));
  const zones = overview.zones.map((zone) => ({
    id: zone.id,
    code: zone.code,
    nameEn: zone.nameEn,
    nameBn: zone.nameBn ?? "",
    rate: formatTakaInput(zone.ratePoisha),
    freeThreshold:
      zone.freeThresholdPoisha === null ? "" : formatTakaInput(zone.freeThresholdPoisha),
    isActive: zone.isActive,
    isDefault: zone.isDefault,
    sortOrder: String(zone.sortOrder),
    areas: zone._count.areas,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery zones</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The customer never picks a zone: it follows from the upazila they choose, then its
          district, then the fallback zone. Changes apply to the next checkout; placed orders keep
          their charge.
        </p>
      </header>

      <section className="mt-8" aria-labelledby="zones-heading">
        <h2 id="zones-heading" className="text-sm font-semibold">
          Zones and rates
        </h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {zones.map((zone) => (
            <ZoneEditor key={zone.id} zone={zone} />
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="threshold-heading">
        <h2 id="threshold-heading" className="text-sm font-semibold">
          Free delivery
        </h2>
        <ThresholdForm initial={formatTakaInput(overview.freeShippingThresholdPoisha)} />
      </section>

      <section className="mt-10" aria-labelledby="areas-heading">
        <h2 id="areas-heading" className="text-sm font-semibold">
          Areas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search a district or upazila / thana (English or Bengali) and set its zone.
        </p>
        <AreaMapper
          zones={zones.map((zone) => ({
            id: zone.id,
            nameEn: zone.nameEn,
            isDefault: zone.isDefault,
          }))}
        />
      </section>
    </div>
  );
}
