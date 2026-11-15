import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { listCustomersForStaff } from "@/modules/orders/orders.service";
import { forPage } from "../page-guard";
import { dhaka } from "../orders/order-ui";

export const metadata = { title: "Customers" };

/**
 * Guests have no account: a customer is a phone number with its orders.
 * Phones are masked without customer.read.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("order.read");
  const query = await searchParams;
  const result = await forPage(listCustomersForStaff(staff, query));
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const link = (page: number) => {
    const params = new URLSearchParams();
    if (query.q !== undefined && query.q !== "") params.set("q", query.q);
    params.set("page", String(page));
    return `/admin/customers?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        One row per phone number, newest activity first.
      </p>
      <form className="mt-6 flex items-end gap-3" action="/admin/customers">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Phone or name"
            className="h-9 w-60 rounded-md border border-input bg-card px-3 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-4 text-sm hover:bg-secondary"
        >
          Search
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[36rem] text-sm" data-testid="customers-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 text-right font-medium">Orders</th>
              <th className="px-4 py-2.5 font-medium">Last order</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  No customers found.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.phone} className="border-t border-border">
                  <td className="px-4 py-3">
                    {row.latestOrderId === null ? (
                      row.name
                    ) : (
                      <Link
                        className="hover:underline"
                        href={`/admin/customers/${row.latestOrderId}`}
                      >
                        {row.name}
                      </Link>
                    )}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {row.phone}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.orders}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.lastOrderAt === null ? "—" : dhaka(row.lastOrderAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          {result.total} customer{result.total === 1 ? "" : "s"} · page {result.page} of {pages}
        </span>
        <span className="flex gap-3">
          {result.page > 1 ? (
            <Link className="underline" href={link(result.page - 1)}>
              Previous
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link className="underline" href={link(result.page + 1)}>
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
