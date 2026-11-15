import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getCustomerView } from "@/modules/orders/orders.service";
import { forPage } from "../../page-guard";
import { dhaka, StatusBadge } from "../../orders/order-ui";
import { CustomerNoteForm } from "./customer-note-form";

export const metadata = { title: "Customer" };

/**
 * A guest customer, found through one of their orders (the phone never goes
 * into a URL): totals, cancellations and failed deliveries, block status and
 * staff notes.
 */
export default async function CustomerPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const staff = await requireStaffPage("order.read");
  const customer = await forPage(getCustomerView(staff, orderId));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/customers" className="text-sm text-muted-foreground hover:underline">
        ← Customers
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <span className="text-sm tabular-nums" data-testid="customer-phone">
          {customer.phone}
        </span>
        {customer.blocked === null ? null : <Badge variant="destructive">Blocked</Badge>}
      </header>
      {customer.blocked === null ? null : (
        <p className="mt-2 text-sm text-destructive">
          Blocked since {dhaka(customer.blocked.since)}: {customer.blocked.reason}
        </p>
      )}

      <dl className="mt-6 grid gap-3 sm:grid-cols-5" data-testid="customer-totals">
        {[
          ["Orders", String(customer.totals.orders)],
          ["Delivered", String(customer.totals.delivered)],
          ["Spent (net of refunds)", formatMoney(customer.totals.spentPoisha, "en")],
          ["Cancelled", String(customer.totals.cancelled)],
          ["Failed deliveries", String(customer.totals.deliveryFailed)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Placed</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-4 py-3 tabular-nums">
                    <Link className="hover:underline" href={`/admin/orders/${order.id}`}>
                      {order.orderNumber}
                    </Link>
                    {order.channel === "STORE" ? (
                      <span className="ms-1 text-xs text-muted-foreground">in store</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dhaka(order.placedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(order.totalPoisha, "en")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="rounded-lg border border-border bg-background p-4 text-sm">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">
            Staff notes <span className="normal-case">(never shown to the customer)</span>
          </h2>
          {customer.canAddNote ? (
            <>
              <ul className="mt-2 flex flex-col gap-2">
                {customer.notes.map((note) => (
                  <li key={note.id}>
                    <p className="whitespace-pre-line">{note.body}</p>
                    <p className="text-xs text-muted-foreground">{dhaka(note.createdAt)}</p>
                  </li>
                ))}
              </ul>
              <CustomerNoteForm orderId={orderId} />
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">Notes need the customer.read permission.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
