import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getOrderForStaff } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../../page-guard";

export const metadata = { title: "Order" };

const REVIEW_TEXT: Record<string, string> = {
  LARGE_QUANTITY: "Many items in one order",
  FIRST_ORDER_HIGH_VALUE: "First order from this phone, high value",
};

function dhaka(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** One order, read-only. Actions (confirm, pack, cancel) come in Phase 9. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("order.read");
  const order = await forPage(getOrderForStaff(staff, id));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
        ← Orders
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{order.orderNumber}</h1>
        <Badge variant="outline">{order.status.toLowerCase()}</Badge>
        <Badge variant="outline">
          {order.paymentMethod ?? "—"} · {order.paymentStatus.toLowerCase()}
        </Badge>
        {order.reviewReasons.length > 0 ? <Badge variant="accent">Review</Badge> : null}
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Placed {dhaka(order.placedAt)} · ships from {order.location.code}
      </p>

      {order.reviewReasons.length > 0 ? (
        <ul className="mt-4 rounded-md border border-accent bg-accent/30 px-4 py-3 text-sm">
          {order.reviewReasons.map((reason) => (
            <li key={reason}>{REVIEW_TEXT[reason] ?? reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-lg border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
                <th className="px-4 py-2.5 text-right font-medium">Discount</th>
                <th className="px-4 py-2.5 text-right font-medium">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    {item.productNameEn}
                    <span className="block text-xs text-muted-foreground">
                      {[item.sizeLabelEn, item.colourLabelEn, item.sku].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(item.unitPricePoisha, "en")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.discountPoisha === 0 ? "—" : `−${formatMoney(item.discountPoisha, "en")}`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(item.lineTotalPoisha, "en")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="flex flex-col gap-1.5 border-t border-border px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotalPoisha, "en")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Discount{order.couponCode === null ? "" : ` (${order.couponCode})`}
              </dt>
              <dd className="tabular-nums">−{formatMoney(order.discountPoisha, "en")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery ({order.zoneName ?? "—"})</dt>
              <dd className="tabular-nums">{formatMoney(order.shippingPoisha, "en")}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <dt>Total to collect</dt>
              <dd className="tabular-nums">{formatMoney(order.totalPoisha, "en")}</dd>
            </div>
          </dl>
        </section>

        <aside className="flex flex-col gap-4 text-sm">
          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Customer</h2>
            <p className="mt-2 font-medium">{order.customerName}</p>
            <p className="tabular-nums" data-testid="order-phone">
              {order.customerPhone}
            </p>
            {order.customerEmail === null ? null : <p>{order.customerEmail}</p>}
            {order.phoneMasked ? (
              <p className="mt-1 text-xs text-muted-foreground">
                The full number needs the customer.read permission.
              </p>
            ) : null}
          </section>
          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Delivery</h2>
            <p className="mt-2">{order.shipLine1}</p>
            {order.shipLandmark === null ? null : (
              <p className="text-muted-foreground">Near {order.shipLandmark}</p>
            )}
            <p>
              {[order.shipUpazilaName, order.shipDistrictName, order.shipDivisionName]
                .filter(Boolean)
                .join(", ")}
            </p>
            {order.deliveryNote === null ? null : (
              <p className="mt-2 text-muted-foreground">Note: {order.deliveryNote}</p>
            )}
          </section>
          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">History</h2>
            <ol className="mt-2 flex flex-col gap-1">
              {order.statusHistory.map((row) => (
                <li key={row.id} className="flex justify-between gap-2">
                  <span>{row.status.toLowerCase()}</span>
                  <span className="text-xs text-muted-foreground">{dhaka(row.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
