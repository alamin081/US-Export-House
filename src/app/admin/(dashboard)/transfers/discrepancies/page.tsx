import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { listTransferDiscrepancies } from "@/modules/inventory/transfer.service";
import { DISCREPANCY_REASON_LABELS } from "@/modules/inventory/transfer-rules";
import { forPage } from "../../page-guard";

export const metadata = { title: "Transfer discrepancies" };

/** Received lines where what arrived differs from what was sent. */
export default async function TransferDiscrepanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage("inventory.read");
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const report = await forPage(listTransferDiscrepancies(staff, page));

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/transfers" className="text-sm text-muted-foreground hover:underline">
        ← Transfers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Transfer discrepancies</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Shortages are written off at the receiving location with their reason; an excess usually
        means the sending location should be counted.
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Transfer</th>
              <th className="px-4 py-2.5 font-medium">Received</th>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 text-right font-medium">Sent</th>
              <th className="px-4 py-2.5 text-right font-medium">Arrived</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No discrepancies.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/transfers/${row.transfer.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.transfer.reference}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {row.transfer.fromLocation.code} → {row.transfer.toLocation.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.transfer.receivedAt === null
                      ? "—"
                      : formatDate(row.transfer.receivedAt, "en")}
                    <span className="block text-xs">
                      {row.transfer.receivedBy?.name ?? row.transfer.receivedBy?.email ?? ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block tabular-nums">{row.variant.sku}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.variant.product.nameEn}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.quantitySent}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.quantityReceived}</td>
                  <td className="px-4 py-3">
                    {row.discrepancyReason === null ? null : (
                      <Badge
                        variant={row.discrepancyReason === "EXCESS" ? "accent" : "destructive"}
                      >
                        {DISCREPANCY_REASON_LABELS[row.discrepancyReason]}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {report.total} lines · page {report.page} of {report.pageCount}
        </span>
        <span className="flex gap-2">
          {report.page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`?page=${report.page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          {report.page < report.pageCount ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`?page=${report.page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
