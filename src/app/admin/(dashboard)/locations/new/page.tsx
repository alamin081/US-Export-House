import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { BD_DIVISIONS } from "@/modules/inventory/location.service";
import { EMPTY_LOCATION, LocationForm } from "../location-form";

export const metadata = { title: "New location" };

export default async function NewLocationPage() {
  await requireStaffPage("location.manage");
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/locations" className="text-sm text-muted-foreground hover:underline">
        ← Locations
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">New location</h1>
      <LocationForm
        initial={EMPTY_LOCATION}
        divisions={BD_DIVISIONS}
        canDelete={false}
        wasDefault={false}
      />
    </div>
  );
}
