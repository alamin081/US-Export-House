import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { listLocationsForStaff } from "@/modules/inventory/location.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Locations" };

/** Branches and warehouses, with stock totals and online-fulfilment flags. */
export default async function LocationsPage() {
  const staff = await requireStaffPage("inventory.read");
  const locations = await forPage(listLocationsForStaff(staff));
  const canManage = hasPermission(staff, "location.manage");

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Branches and warehouses. Online orders are fulfilled from the default online location;
            any location marked online also counts towards online stock.
          </p>
        </div>
        {canManage ? (
          <Link href="/admin/locations/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New location
          </Link>
        ) : null}
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[48rem] text-sm" data-testid="locations-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Area</th>
              <th className="px-4 py-2.5 font-medium">Online</th>
              <th className="px-4 py-2.5 text-right font-medium">On hand</th>
              <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
              <th className="px-4 py-2.5 text-right font-medium">Staff</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No locations yet.
                </td>
              </tr>
            ) : (
              locations.map((location) => (
                <tr key={location.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    <Link className="hover:underline" href={`/admin/locations/${location.id}`}>
                      {location.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {location.nameEn}
                      <Badge variant="outline">
                        {location.type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                      </Badge>
                      {location.isActive ? null : <Badge variant="muted">Inactive</Badge>}
                      <SampleBadge show={location.isSample} />
                    </span>
                    {location.nameBn === null ? null : (
                      <span lang="bn" className="text-xs text-muted-foreground">
                        {location.nameBn}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[location.thana, location.district].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {location.isDefaultOnlineFulfillment ? (
                      <Badge variant="success">Default online</Badge>
                    ) : location.isOnlineFulfillment ? (
                      <Badge variant="outline">Online</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{location.onHand}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{location.reserved}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {location._count.staffAccess}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
