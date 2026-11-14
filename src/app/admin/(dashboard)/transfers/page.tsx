import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { listStaffLocations } from "@/modules/inventory/inventory.service";
import { listTransfersForStaff } from "@/modules/inventory/transfer.service";
import { forPage } from "../page-guard";
import { TransferStatusBadge } from "./transfer-status";

export const metadata = { title: "Transfers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Transfers that touch the caller's locations, newest first. */
export default async function TransfersPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage("transfer.create");
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const [list, locations] = await Promise.all([
    forPage(listTransfersForStaff(staff, raw)),
    listStaffLocations(staff),
  ]);
  const pageLink = (page: number) =>
    `/admin/transfers?${new URLSearchParams(
      Object.entries({ ...raw, page: String(page) }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
      ),
    ).toString()}`;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transfers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The sending location dispatches, the receiving location receives. Stock on a dispatched
            transfer is in transit and counts towards no location.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission(staff, "inventory.read") ? (
            <Link
              href="/admin/transfers/discrepancies"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Discrepancy report
            </Link>
          ) : null}
          <Link href="/admin/transfers/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New transfer
          </Link>
        </div>
      </header>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <Select name="status" defaultValue={list.query.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {(["DRAFT", "APPROVED", "DISPATCHED", "RECEIVED", "CANCELLED"] as const).map((status) => (
            <option key={status} value={status}>
              {status === "DISPATCHED"
                ? "In transit"
                : status.charAt(0) + status.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
        <Select name="locationId" defaultValue={list.query.locationId ?? ""} aria-label="Location">
          <option value="">All my locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.nameEn}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Apply
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[40rem] text-sm" data-testid="transfers-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Reference</th>
              <th className="px-4 py-2.5 font-medium">From → To</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th className="px-4 py-2.5 text-right font-medium">Units</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No transfers.
                </td>
              </tr>
            ) : (
              list.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    <Link href={`/admin/transfers/${row.id}`} className="hover:underline">
                      {row.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.from} → {row.to}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <TransferStatusBadge status={row.status} />
                      {row.discrepancy ? <Badge variant="destructive">Discrepancy</Badge> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.lines}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.units}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(row.createdAt, "en")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground tabular-nums">
          {list.total} transfer{list.total === 1 ? "" : "s"} · page {list.page} of {list.pageCount}
        </span>
        <span className="flex gap-2">
          {list.page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageLink(list.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {list.page < list.pageCount ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageLink(list.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
