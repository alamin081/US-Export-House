import Link from "next/link";
import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { getInventorySettings } from "@/modules/settings/settings.service";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Stock CSV import" };

/** A file download (a Route Handler), not a page: a plain link, not <Link>. */
const TEMPLATE_URL = "/api/admin/inventory/import-template";

export default async function StockImportPage() {
  await requireStaffPage("inventory.receive");
  const settings = await getInventorySettings();

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">
        ← Inventory
      </Link>
      <header className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock CSV import</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Columns: <code>location_code, sku, quantity, unit_cost_tk</code> (cost optional). Excel
            files saved as “CSV UTF-8” work as they are: commas or semicolons, blank rows and SKU
            letter case do not matter, and Bengali digits are read. Put costs like “1,250.50” in
            quotes. Up to {settings.importMaxRows.toLocaleString("en-US")} rows; the preview saves
            nothing.
          </p>
        </div>
        <a
          href={TEMPLATE_URL}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download aria-hidden="true" />
          Download template
        </a>
      </header>
      <ImportWizard />
    </div>
  );
}
