import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { listOrdersForStaff } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Orders" };

const STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

function dhaka(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Online orders, newest first. Read-only in Phase 8: confirming, packing and
 * cancelling arrive in Phase 9. The phone is masked without customer.read.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("order.read");
  const query = await searchParams;
  const result = await forPage(listOrdersForStaff(staff, query));
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const link = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes })) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    const text = params.toString();
    return text === "" ? "/admin/orders" : `/admin/orders?${text}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Online orders (cash on delivery). Processing them arrives in Phase 9; orders marked “Review”
        should be confirmed by phone first.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin/orders">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Order number or phone"
            className="h-9 w-56 rounded-md border border-input bg-card px-3 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
          >
            <option value="">Any</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="review" value="1" defaultChecked={query.review === "1"} />
          Needs review only
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-4 text-sm hover:bg-secondary"
        >
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[56rem] text-sm" data-testid="orders-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Placed</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Delivery</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No orders found.
                </td>
              </tr>
            ) : (
              result.rows.map((order) => (
                <tr key={order.id} className="border-t border-border" data-testid="order-row">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    <Link className="hover:underline" href={`/admin/orders/${order.id}`}>
                      {order.orderNumber}
                    </Link>
                    {order.reviewReasons.length > 0 ? (
                      <Badge variant="accent" className="ms-2" data-testid="review-badge">
                        Review
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dhaka(order.placedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {order.customerName}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {order.customerPhone}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {order.zoneName ?? "—"}
                    <span className="block text-muted-foreground">{order.shipDistrictName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{order.status.toLowerCase()}</Badge>
                    <span className="ms-1 text-xs text-muted-foreground">
                      {order.paymentMethod ?? ""} {order.paymentStatus.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(order.totalPoisha, "en")}
                    <span className="block text-xs text-muted-foreground">
                      {order._count.items} line{order._count.items === 1 ? "" : "s"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          {result.total} order{result.total === 1 ? "" : "s"} · page {result.page} of {pages}
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
