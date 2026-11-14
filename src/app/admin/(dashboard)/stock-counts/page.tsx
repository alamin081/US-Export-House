import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { listCategoryOptions, listStaffLocations } from "@/modules/inventory/inventory.service";
import { listCounts } from "@/modules/inventory/stock-count.service";
import { forPage } from "../page-guard";
import { StartCountForm } from "./start-count-form";

export const metadata = { title: "Stock counts" };

const STATUS: Record<
  string,
  { label: string; variant: "outline" | "accent" | "success" | "muted" }
> = {
  IN_PROGRESS: { label: "Counting", variant: "accent" },
  SUBMITTED: { label: "Awaiting review", variant: "outline" },
  APPLIED: { label: "Applied", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "muted" },
};

export default async function StockCountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage("inventory.read");
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const list = await forPage(listCounts(staff, raw));
  const canStart = hasPermission(staff, "inventory.count");
  const [locations, categories] = canStart
    ? await Promise.all([listStaffLocations(staff), listCategoryOptions(staff)])
    : [[], []];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Stock counts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start a count, scan or type what is on the shelf, submit, and a Store Manager applies the
        corrections. Sales during the count are taken into account.
      </p>

      {canStart ? (
        <div className="mt-6">
          <StartCountForm
            locations={locations.map((location) => ({
              id: location.id,
              label: `${location.code} · ${location.nameEn}${location.isSample ? " (sample)" : ""}`,
            }))}
            categories={categories.map((category) => ({
              id: category.id,
              label: `${category.parentId === null ? "" : "— "}${category.nameEn}`,
            }))}
          />
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[40rem] text-sm" data-testid="counts-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Reference</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Scope</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No stock counts yet.
                </td>
              </tr>
            ) : (
              list.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    <Link href={`/admin/stock-counts/${row.id}`} className="hover:underline">
                      {row.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {row.location.code}
                      <SampleBadge show={row.location.isSample} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.category?.nameEn ?? "Whole location"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS[row.status]?.variant ?? "outline"}>
                      {STATUS[row.status]?.label ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row._count.items}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.startedAt === null ? "—" : formatDateTime(row.startedAt, "en")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {list.total} counts · page {list.page} of {list.pageCount}
        </span>
        <span className="flex gap-2">
          {list.page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`?page=${list.page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          {list.page < list.pageCount ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`?page=${list.page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
