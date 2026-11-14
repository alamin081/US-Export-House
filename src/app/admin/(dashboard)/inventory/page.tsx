import Link from "next/link";
import { Download, FileUp, PackagePlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { getMatrix } from "@/modules/inventory/inventory.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Inventory" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Variant x location matrix: available (large) with on hand / reserved, stock
 * in transit, filters and CSV export. Branch staff only see their branches.
 */
export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage("inventory.read");
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const matrix = await forPage(getMatrix(staff, raw));
  const { query } = matrix;
  const params = (page: number) =>
    new URLSearchParams(
      Object.entries({ ...raw, page: String(page) }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
      ),
    ).toString();
  const exportParams = new URLSearchParams(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[1] !== "" && entry[0] !== "page",
    ),
  ).toString();

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Available = on hand − reserved. Stock in transit belongs to no location until it is
            received.
            {matrix.locations.some((location) => location.isSample) ? (
              <span className="ms-2 inline-block align-middle">
                <SampleBadge show />
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission(staff, "inventory.receive") ? (
            <>
              <Link href="/admin/inventory/receive" className={buttonVariants({ size: "sm" })}>
                <PackagePlus aria-hidden="true" />
                Receive stock
              </Link>
              <Link
                href="/admin/inventory/import"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <FileUp aria-hidden="true" />
                CSV import
              </Link>
            </>
          ) : null}
          <a
            href={`/api/admin/inventory/export${exportParams === "" ? "" : `?${exportParams}`}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export CSV
          </a>
        </div>
      </header>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      >
        <Input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Search name, SKU or barcode"
          aria-label="Search"
        />
        <Select name="locationId" defaultValue={query.locationId ?? ""} aria-label="Location">
          <option value="">All my locations</option>
          {matrix.locationOptions.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.nameEn}
            </option>
          ))}
        </Select>
        <Select name="categoryId" defaultValue={query.categoryId ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {matrix.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.parentId === null ? "" : "— "}
              {category.nameEn}
            </option>
          ))}
        </Select>
        <Select name="stock" defaultValue={query.stock ?? ""} aria-label="Stock level">
          <option value="">Any stock level</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </Select>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Apply
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full text-sm" data-testid="inventory-matrix">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 min-w-56 bg-secondary px-3 py-2.5 font-medium">Item</th>
              {matrix.locations.map((location) => (
                <th
                  key={location.id}
                  className="min-w-28 px-3 py-2.5 text-right font-medium"
                  data-location={location.code}
                >
                  <span className="block">{location.code}</span>
                  <span className="font-normal">
                    {location.isOnlineFulfillment ? "online" : location.type.toLowerCase()}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">In transit</th>
              <th className="px-3 py-2.5 text-right font-medium">Total on hand</th>
              {matrix.showCost ? (
                <th className="px-3 py-2.5 text-right font-medium">Avg. cost</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={matrix.locations.length + 4}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No items match these filters.
                </td>
              </tr>
            ) : (
              matrix.rows.map((row) => (
                <tr key={row.variantId} className="border-t border-border" data-sku={row.sku}>
                  <td className="sticky left-0 bg-background px-3 py-2.5">
                    <Link
                      href={`/admin/inventory/${row.variantId}`}
                      className="font-medium tabular-nums hover:underline"
                    >
                      {row.sku}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {row.name}
                      {row.label === null ? "" : ` — ${row.label}`}
                    </span>
                    {row.isActive ? null : <Badge variant="muted">Inactive</Badge>}
                  </td>
                  {matrix.locations.map((location) => {
                    const cell = row.cells[location.id];
                    return (
                      <td
                        key={location.id}
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          cell?.state === "out" && "bg-destructive/5",
                          cell?.state === "low" && "bg-accent/40",
                        )}
                        data-location={location.code}
                        data-available={cell?.available ?? 0}
                      >
                        <span className="block text-base font-semibold">
                          {cell?.available ?? 0}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cell?.onHand ?? 0} / {cell?.reserved ?? 0}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.inTransit === 0 ? "—" : row.inTransit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.totals.onHand}</td>
                  {matrix.showCost ? (
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.costPoisha === null || row.costPoisha === undefined
                        ? "—"
                        : formatMoney(row.costPoisha, "en")}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Each cell: available (large), then on hand / reserved. Shaded: low or out of stock.
      </p>

      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground tabular-nums">
          {matrix.total} item{matrix.total === 1 ? "" : "s"} · page {matrix.page} of{" "}
          {matrix.pageCount}
        </span>
        <span className="flex gap-2">
          {matrix.page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/admin/inventory?${params(matrix.page - 1)}`}
            >
              Previous
            </Link>
          ) : null}
          {matrix.page < matrix.pageCount ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/admin/inventory?${params(matrix.page + 1)}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
