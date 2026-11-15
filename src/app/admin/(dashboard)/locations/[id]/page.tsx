import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { BD_DIVISIONS, getLocationForStaff } from "@/modules/inventory/location.service";
import { forPage } from "../../page-guard";
import { LocationForm } from "../location-form";

export const metadata = { title: "Location" };

/** Edit a location; see who can work there and what history it has. */
export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("inventory.read");
  const { id } = await params;
  const {
    location,
    staff: access,
    history,
    canDelete,
  } = await forPage(getLocationForStaff(staff, id));
  const canManage = hasPermission(staff, "location.manage");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/locations" className="text-sm text-muted-foreground hover:underline">
        ← Locations
      </Link>
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
        {location.code} · {location.nameEn}
        <SampleBadge show={location.isSample} />
        {location.isActive ? null : <Badge variant="muted">Inactive</Badge>}
      </h1>

      <div className="mt-6">
        {canManage ? (
          <LocationForm
            divisions={BD_DIVISIONS}
            canDelete={canDelete}
            wasDefault={location.isDefaultOnlineFulfillment}
            initial={{
              id: location.id,
              code: location.code,
              type: location.type,
              nameEn: location.nameEn,
              nameBn: location.nameBn ?? "",
              division: location.division ?? "",
              district: location.district ?? "",
              thana: location.thana ?? "",
              addressEn: location.addressEn ?? "",
              addressBn: location.addressBn ?? "",
              phone: location.phone ?? "",
              hoursEn: location.hoursEn ?? "",
              hoursBn: location.hoursBn ?? "",
              mapUrl: location.mapUrl ?? "",
              sortOrder: String(location.sortOrder),
              isActive: location.isActive,
              isOnlineFulfillment: location.isOnlineFulfillment,
              isDefaultOnlineFulfillment: location.isDefaultOnlineFulfillment,
            }}
          />
        ) : (
          <dl className="grid gap-3 rounded-lg border border-border bg-background p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Address</dt>
              <dd>
                {[location.addressEn, location.thana, location.district, location.division]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{location.phone ?? "—"}</dd>
            </div>
          </dl>
        )}
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold">Staff with access</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Assigned on the Staff page. Roles that see every location are listed separately.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {access.assigned.length === 0 ? (
              <li className="text-muted-foreground">Nobody is assigned to this location.</li>
            ) : (
              access.assigned.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {user.name ?? user.email}
                    <span className="ms-2 text-xs text-muted-foreground">{user.email}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{user.role?.name ?? "No role"}</Badge>
                    {user.isActive ? null : <Badge variant="muted">Inactive</Badge>}
                  </span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Every location:{" "}
            {access.allLocationRoles
              .map((role) => `${role.name} (${role._count.users})`)
              .join(", ")}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold">Stock and history</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">On hand</dt>
            <dd className="tabular-nums">{history.onHand}</dd>
            <dt className="text-muted-foreground">Reserved</dt>
            <dd className="tabular-nums">{history.reserved}</dd>
            <dt className="text-muted-foreground">Ledger entries</dt>
            <dd className="tabular-nums">{history.movements}</dd>
            <dt className="text-muted-foreground">Transfers</dt>
            <dd className="tabular-nums">{history.transfers}</dd>
            <dt className="text-muted-foreground">Stock counts</dt>
            <dd className="tabular-nums">{history.counts}</dd>
            <dt className="text-muted-foreground">Orders</dt>
            <dd className="tabular-nums">{history.orders}</dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {canDelete
              ? "No history yet, so this location can still be deleted."
              : "A location with stock or history is never deleted, only deactivated."}
          </p>
          <Link
            href={`/admin/inventory?locationId=${location.id}`}
            className="mt-3 inline-block text-sm underline underline-offset-4"
          >
            View stock at {location.code}
          </Link>
        </div>
      </section>
    </div>
  );
}
