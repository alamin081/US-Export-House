import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getSizeCharts } from "@/modules/catalog/taxonomy.service";

export const metadata = { title: "Size charts" };

export default async function SizeChartsPage() {
  const staff = await requireStaffPage("catalog.read");
  const charts = await getSizeCharts(staff);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Size charts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attach a chart to a category (default for its products) or to one product. Shown as the
            size guide.
          </p>
        </div>
        {hasPermission(staff, "catalog.write") ? (
          <Link href="/admin/size-charts/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New size chart
          </Link>
        ) : null}
      </header>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
        {charts.map((chart) => (
          <li key={chart.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <Link href={`/admin/size-charts/${chart.id}`} className="font-medium hover:underline">
              {chart.nameEn}
            </Link>
            <span className="text-xs text-muted-foreground">
              {chart.unit === "CM" ? "cm" : "inches"} · {chart._count.categories} categories ·{" "}
              {chart._count.products} products
            </span>
          </li>
        ))}
        {charts.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No size charts yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
