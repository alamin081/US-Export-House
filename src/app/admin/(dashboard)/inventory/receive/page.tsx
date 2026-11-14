import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { listStaffLocations } from "@/modules/inventory/inventory.service";
import { ReceiveForm } from "./receive-form";

export const metadata = { title: "Receive stock" };

export default async function ReceiveStockPage() {
  const staff = await requireStaffPage("inventory.receive");
  const locations = await listStaffLocations(staff);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">
        ← Inventory
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Receive stock</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Goods from a supplier or the factory. Scan each item (a scan adds one) or type its SKU, then
        check the quantities.
      </p>
      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no active location to receive into.
        </p>
      ) : (
        <ReceiveForm
          locations={locations.map((location) => ({
            id: location.id,
            label: `${location.code} · ${location.nameEn}${location.isSample ? " (sample)" : ""}`,
          }))}
        />
      )}
    </div>
  );
}
