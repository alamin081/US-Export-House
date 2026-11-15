import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import {
  RETURN_REASON_LABELS,
  RETURN_TABS,
  listReturnsForStaff,
} from "@/modules/returns/returns.service";
import type { ReturnReason } from "@/modules/returns/return-rules";
import { cn } from "@/lib/utils";
import { forPage } from "../page-guard";
import { dhaka } from "../orders/order-ui";
import { RETURN_STATUS_LABELS } from "./return-ui";

export const metadata = { title: "Returns & exchanges" };

/** Return and exchange requests, from customers (tracking page) and staff. */
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("return.manage");
  const query = await searchParams;
  const result = await forPage(listReturnsForStaff(staff, query));
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const link = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes })) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    return `/admin/returns?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Returns &amp; exchanges</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a return from a delivered order&apos;s page. Customers can also ask from the order
            tracking page.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          {hasPermission(staff, "refund.approve") ? (
            <Link className="underline" href="/admin/refunds">
              Refunds to approve
            </Link>
          ) : null}
          {hasPermission(staff, "return.policy.publish") ? (
            <Link className="underline" href="/admin/returns/policy">
              Return policy
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border" aria-label="Return stages">
        {RETURN_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={link({ tab: tab.key, page: undefined })}
            aria-current={result.tab === tab.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              result.tab === tab.key
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <form className="mt-4 flex items-end gap-3" action="/admin/returns">
        <input type="hidden" name="tab" value={result.tab} />
        <input
          name="q"
          defaultValue={query.q ?? ""}
          aria-label="Search"
          placeholder="Return or order number"
          className="h-9 w-60 rounded-md border border-input bg-card px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-4 text-sm hover:bg-secondary"
        >
          Search
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[48rem] text-sm" data-testid="returns-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Return</th>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No returns here.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="border-t border-border" data-testid="return-row">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    <Link className="hover:underline" href={`/admin/returns/${row.id}`}>
                      {row.reference}
                    </Link>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s) ·{" "}
                      {row.source === "CUSTOMER" ? "from customer" : "by staff"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Link className="hover:underline" href={`/admin/orders/${row.order.id}`}>
                      {row.order.orderNumber}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {row.order.customerName}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.type === "EXCHANGE" ? "Exchange" : "Return"}</td>
                  <td className="px-4 py-3 text-xs">
                    {row.reasonCode === null
                      ? "—"
                      : RETURN_REASON_LABELS[row.reasonCode as ReturnReason]}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.status === "REQUESTED" ? "accent" : "outline"}>
                      {RETURN_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dhaka(row.requestedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          {result.total} return{result.total === 1 ? "" : "s"} · page {result.page} of {pages}
        </span>
        <span className="flex gap-3">
          {result.page > 1 ? (
            <Link className="underline" href={link({ page: String(result.page - 1) })}>
              Previous
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link className="underline" href={link({ page: String(result.page + 1) })}>
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
