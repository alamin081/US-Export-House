import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { listStaffLocations } from "@/modules/inventory/inventory.service";
import {
  REFUND_METHOD_LABELS,
  RETURN_REASON_LABELS,
  type ReturnReason,
} from "@/modules/returns/return-rules";
import { getReturnForStaff } from "@/modules/returns/returns.service";
import { forPage } from "../../page-guard";
import { dhaka } from "../../orders/order-ui";
import { INSPECTION_LABELS, RETURN_STATUS_LABELS } from "../return-ui";
import { ReturnSteps } from "./return-steps";

export const metadata = { title: "Return" };

/** One return or exchange: items and their value, photos, the replacement order, refunds, next step. */
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("return.manage");
  const view = await forPage(getReturnForStaff(staff, id));
  const { request } = view;
  const locations = await listStaffLocations(staff);
  const credit = request.items.reduce((sum, item) => sum + item.creditPoisha, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/returns" className="text-sm text-muted-foreground hover:underline">
        ← Returns
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{request.reference}</h1>
        <Badge variant="outline" data-testid="return-status">
          {RETURN_STATUS_LABELS[request.status] ?? request.status}
        </Badge>
        <Badge variant="muted">{request.type === "EXCHANGE" ? "Exchange" : "Return"}</Badge>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Order{" "}
        <Link className="underline" href={`/admin/orders/${request.order.id}`}>
          {request.order.orderNumber}
        </Link>{" "}
        · {request.order.customerName} · {request.order.customerPhone} · requested{" "}
        {dhaka(request.requestedAt)}{" "}
        {request.source === "CUSTOMER" ? "by the customer" : "by staff"}
      </p>
      <p className="mt-2 text-sm">
        <strong>
          {request.reasonCode === null
            ? "—"
            : RETURN_REASON_LABELS[request.reasonCode as ReturnReason]}
        </strong>
        {request.reason === null ? "" : ` — ${request.reason}`}
      </p>
      {request.outsideWindowNote === null ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
          Accepted after the return window: {request.outsideWindowNote}
        </p>
      )}
      {request.rejectionReason === null ? null : (
        <p className="mt-1 text-sm text-destructive">Refused: {request.rejectionReason}</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-background">
            <table className="w-full text-sm" data-testid="return-items">
              <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Units</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Inspection</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      {item.orderItem.productNameEn}
                      <span className="block text-xs text-muted-foreground">
                        {[
                          item.orderItem.sizeLabelEn,
                          item.orderItem.colourLabelEn,
                          item.orderItem.sku,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.creditPoisha === 0 && request.status === "REQUESTED"
                        ? "on approval"
                        : formatMoney(item.creditPoisha, "en")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {INSPECTION_LABELS[item.inspectionResult] ?? item.inspectionResult}
                      {item.inspectionNote === null ? null : (
                        <span className="block text-muted-foreground">{item.inspectionNote}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {credit > 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm">
                Value of the units:{" "}
                <strong className="tabular-nums">{formatMoney(credit, "en")}</strong> (price minus
                each line&apos;s share of the order discount)
              </p>
            ) : null}
          </section>

          <ReturnSteps
            returnId={request.id}
            status={request.status}
            type={request.type}
            items={request.items.map((item) => ({
              id: item.id,
              sku: item.orderItem.sku,
              name: item.orderItem.productNameEn,
              quantity: item.quantity,
            }))}
            locations={locations.map((location) => ({
              id: location.id,
              label: `${location.code} — ${location.nameEn}`,
            }))}
            defaultLocationId={request.order.locationId}
            outstandingPoisha={view.outstandingPoisha}
            canRecordRefund={view.canRecordRefund}
            refundPending={request.refunds.some((refund) => refund.status === "PENDING")}
          />
        </div>

        <aside className="flex flex-col gap-4 text-sm">
          {request.exchangeOrder === null ? null : (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase">
                Exchange order
              </h2>
              <p className="mt-2">
                <Link
                  className="tabular-nums underline"
                  href={`/admin/orders/${request.exchangeOrder.id}`}
                  data-testid="exchange-order-link"
                >
                  {request.exchangeOrder.orderNumber}
                </Link>{" "}
                · {request.exchangeOrder.status.toLowerCase()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Credit used: {formatMoney(view.exchangeCreditUsedPoisha, "en")}
              </p>
            </section>
          )}
          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Refunds</h2>
            {request.refunds.length === 0 ? (
              <p className="mt-2 text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5" data-testid="refunds">
                {request.refunds.map((refund) => (
                  <li key={refund.id} className="flex justify-between gap-2">
                    <span>
                      {REFUND_METHOD_LABELS[refund.method as keyof typeof REFUND_METHOD_LABELS] ??
                        refund.method}{" "}
                      · {refund.status.toLowerCase()}
                      {refund.reference === null ? null : (
                        <span className="block text-xs text-muted-foreground">
                          {refund.reference}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums">{formatMoney(refund.amountPoisha, "en")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Order collected {formatMoney(request.order.paidPoisha, "en")}, refunded{" "}
              {formatMoney(request.order.refundedPoisha, "en")}.
            </p>
          </section>
          {request.photos.length === 0 ? null : (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase">Photos</h2>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {request.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- customer photos, any size */}
                    <img
                      src={photo.url}
                      alt="Photo from the return request"
                      className="aspect-square w-full rounded object-cover"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
