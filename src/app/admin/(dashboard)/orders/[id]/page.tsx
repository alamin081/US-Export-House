import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { CANCEL_REASON_LABELS } from "@/modules/orders/order-labels";
import { getOrderForStaff } from "@/modules/orders/orders.service";
import { COURIER_LABELS } from "@/modules/settings/order-settings";
import { forPage } from "../../page-guard";
import { CALL_OUTCOME_LABELS, dhaka, REVIEW_TEXT, StatusBadge } from "../order-ui";
import { CopyButton } from "./copy-button";
import { NoteForm, OrderActionsPanel } from "./order-actions";

export const metadata = { title: "Order" };

/**
 * One order: lines and money, customer and address (with a copy button),
 * calls, history, payments, shipments, invoices, staff notes, and the steps
 * this staff member may take now.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("order.read");
  const view = await forPage(getOrderForStaff(staff, id));
  const { order, actions } = view;
  const name = (userId: string | null) =>
    userId === null ? "System" : (view.userNames[userId] ?? "Staff");
  const address = [
    order.shipLine1,
    order.shipLandmark === null ? null : `Near ${order.shipLandmark}`,
    [order.shipUpazilaName, order.shipDistrictName, order.shipDivisionName]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join("\n");
  const shipment = order.shipments[0];
  const invoice = order.invoices.find((row) => row.isCurrent);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
        ← Orders
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{order.orderNumber}</h1>
        <StatusBadge status={order.status} />
        <Badge variant="outline" data-testid="payment-status">
          {order.paymentMethod ?? "—"} · {order.paymentStatus.toLowerCase()}
        </Badge>
        {order.reviewReasons.length > 0 ? <Badge variant="accent">Review</Badge> : null}
        {order.unreachableAt !== null ? <Badge variant="destructive">Unreachable</Badge> : null}
        {order.location.isSample ? <Badge variant="outline">Sample data</Badge> : null}
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Placed {dhaka(order.placedAt)} · ships from {order.location.code} ({order.location.nameEn})
        {order.channel === "STORE" ? " · in-store sale" : ""}
      </p>

      {order.reviewReasons.length > 0 ? (
        <ul className="mt-4 rounded-md border border-accent bg-accent/30 px-4 py-3 text-sm">
          {order.reviewReasons.map((reason) => (
            <li key={reason}>{REVIEW_TEXT[reason] ?? reason}</li>
          ))}
        </ul>
      ) : null}
      {view.deliveryFailuresForPhone > 0 ? (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          data-testid="failure-warning"
        >
          This phone number has {view.deliveryFailuresForPhone} failed deliver
          {view.deliveryFailuresForPhone === 1 ? "y" : "ies"} on record. Confirm carefully.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-background">
            <table className="w-full text-sm" data-testid="order-items">
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
                        {[item.sizeLabelEn, item.colourLabelEn, item.sku]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(item.unitPricePoisha, "en")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.discountPoisha === 0
                        ? "—"
                        : `−${formatMoney(item.discountPoisha, "en")}`}
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
                <dt>Total</dt>
                <dd className="tabular-nums" data-testid="order-total">
                  {formatMoney(order.totalPoisha, "en")}
                </dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Collected</dt>
                <dd className="tabular-nums">{formatMoney(order.paidPoisha, "en")}</dd>
              </div>
              {order.refundedPoisha > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">{formatMoney(order.refundedPoisha, "en")}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <OrderActionsPanel
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              version: order.version,
              totalPoisha: order.totalPoisha,
              paidPoisha: order.paidPoisha,
              paymentMethod: order.paymentMethod,
              locationId: order.locationId,
              items: order.items.map((item) => ({
                id: item.id,
                sku: item.sku,
                name: item.productNameEn,
                quantity: item.quantity,
              })),
            }}
            actions={actions}
            couriers={view.couriers.map((key) => ({ key, label: COURIER_LABELS[key] }))}
            locations={view.fulfilmentLocations}
            countedCalls={view.countedCalls}
            unreachableAfter={view.callSettings.unreachableAfterAttempts}
          />

          <section className="rounded-lg border border-border bg-background p-4 text-sm">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Calls</h2>
            {order.callLogs.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No calls logged yet.</p>
            ) : (
              <ol className="mt-2 flex flex-col gap-1.5" data-testid="call-log">
                {order.callLogs.map((call) => (
                  <li key={call.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {CALL_OUTCOME_LABELS[call.outcome] ?? call.outcome}
                      {call.counted ? (
                        <span className="ms-1 text-xs text-muted-foreground">(counted)</span>
                      ) : null}
                      {call.note === null ? null : (
                        <span className="block text-xs text-muted-foreground">{call.note}</span>
                      )}
                      {call.callbackAt === null ? null : (
                        <span className="block text-xs">Call back {dhaka(call.callbackAt)}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dhaka(call.createdAt)} · {name(call.userId)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-lg border border-border bg-background p-4 text-sm">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">History</h2>
            <ol className="mt-2 flex flex-col gap-1.5" data-testid="order-history">
              {order.statusHistory.map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {row.event === null
                      ? (STATUS_TEXT[row.status] ?? row.status)
                      : (EVENT_TEXT[row.event] ?? row.event)}
                    {row.noteEn === null ? null : (
                      <span className="block text-xs text-muted-foreground">{row.noteEn}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dhaka(row.createdAt)} · {name(row.userId)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4 text-sm">
          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Customer</h2>
            <p className="mt-2 font-medium">{order.customerName}</p>
            <p className="tabular-nums">
              <span data-testid="order-phone">{order.customerPhone}</span>
              {view.phoneMasked ? null : <CopyButton text={order.customerPhone} label="phone" />}
            </p>
            {order.customerEmail === null ? null : <p>{order.customerEmail}</p>}
            {view.phoneMasked ? (
              <p className="mt-1 text-xs text-muted-foreground">
                The full number needs the customer.read permission.
              </p>
            ) : null}
            <Link className="mt-2 inline-block underline" href={`/admin/customers/${order.id}`}>
              Customer history
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
              Delivery address
              <CopyButton
                text={`${order.customerName}\n${order.customerPhone}\n${address}`}
                label="address"
              />
            </h2>
            <p className="mt-2 whitespace-pre-line" data-testid="order-address">
              {address}
            </p>
            {order.deliveryNote === null ? null : (
              <p className="mt-2 text-muted-foreground">Note: {order.deliveryNote}</p>
            )}
            {actions.edit ? (
              <Link className="mt-2 inline-block underline" href={`/admin/orders/${order.id}/edit`}>
                Edit order
              </Link>
            ) : actions.correctAddress ? (
              <Link className="mt-2 inline-block underline" href={`/admin/orders/${order.id}/edit`}>
                Correct the address
              </Link>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Payment</h2>
            {order.payments.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No payment recorded.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-2">
                    <span>
                      {payment.provider} · {payment.status.toLowerCase()}
                      {payment.mode === "MOCK" ? " (mock)" : ""}
                      {payment.providerReference === null ? null : (
                        <span className="block text-xs text-muted-foreground">
                          {payment.providerReference}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums">{formatMoney(payment.amountPoisha, "en")}</span>
                  </li>
                ))}
              </ul>
            )}
            {order.codItem === null ? null : (
              <p className="mt-2 text-xs text-muted-foreground">
                Courier settlement {order.codItem.settlement.reference}:{" "}
                {formatMoney(order.codItem.receivedPoisha, "en")} of{" "}
                {formatMoney(order.codItem.expectedPoisha, "en")}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Shipment</h2>
            {shipment === undefined ? (
              <p className="mt-2 text-muted-foreground">Not shipped yet.</p>
            ) : (
              <div className="mt-2" data-testid="shipment">
                <p>
                  {shipment.courierName ??
                    COURIER_LABELS[shipment.courier as keyof typeof COURIER_LABELS] ??
                    shipment.courier}
                  {shipment.trackingCode === null ? "" : ` · ${shipment.trackingCode}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {shipment.status.toLowerCase().replaceAll("_", " ")} · collect{" "}
                  {formatMoney(shipment.codAmountPoisha, "en")}
                  {shipment.mode === "MOCK" ? " · mock" : ""}
                </p>
                {shipment.failedReason === null ? null : (
                  <p className="text-xs text-destructive">{shipment.failedReason}</p>
                )}
                {shipment.lostChargePoisha > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Lost delivery charge {formatMoney(shipment.lostChargePoisha, "en")}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">Documents</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {actions.printSlip ? (
                <li>
                  <a
                    className="underline"
                    href={`/admin/print/orders/packing-slips?ids=${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Packing slip
                  </a>
                </li>
              ) : null}
              {actions.printSlip && order.channel === "ONLINE" ? (
                <li>
                  <a
                    className="underline"
                    href={`/admin/print/orders/address-labels?ids=${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Address label
                  </a>
                </li>
              ) : null}
              {order.invoices.map((row) => (
                <li key={row.id} data-testid="invoice-row">
                  {actions.printInvoice ? (
                    <a
                      className="underline"
                      href={`/admin/print/orders/${order.id}/invoice?v=${row.version}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Invoice {row.number} v{row.version}
                    </a>
                  ) : (
                    <>
                      Invoice {row.number} v{row.version}
                    </>
                  )}
                  {row.isCurrent ? "" : " (superseded)"}
                  {row.reason === null ? null : (
                    <span className="block text-xs text-muted-foreground">{row.reason}</span>
                  )}
                </li>
              ))}
              {order.invoices.length === 0 ? (
                <li className="text-muted-foreground">The invoice is issued when it ships.</li>
              ) : null}
            </ul>
            {invoice === undefined ? null : (
              <p className="mt-1 text-xs text-muted-foreground">Issued {dhaka(invoice.issuedAt)}</p>
            )}
          </section>

          {order.exchangeFor !== null || order.returnRequests.length > 0 || actions.startReturn ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase">
                Returns &amp; exchanges
              </h2>
              {order.exchangeFor === null ? null : (
                <p className="mt-2" data-testid="exchange-of">
                  Exchange for{" "}
                  <Link className="underline" href={`/admin/orders/${order.exchangeFor.order.id}`}>
                    {order.exchangeFor.order.orderNumber}
                  </Link>{" "}
                  (
                  <Link className="underline" href={`/admin/returns/${order.exchangeFor.id}`}>
                    {order.exchangeFor.reference}
                  </Link>
                  )
                </p>
              )}
              <ul className="mt-2 flex flex-col gap-1">
                {order.returnRequests.map((request) => (
                  <li key={request.id}>
                    <Link className="underline" href={`/admin/returns/${request.id}`}>
                      {request.reference}
                    </Link>{" "}
                    · {request.type === "EXCHANGE" ? "exchange" : "return"} ·{" "}
                    {request.status.toLowerCase()}
                  </li>
                ))}
              </ul>
              {actions.startReturn ? (
                <Link
                  className="mt-2 inline-block underline"
                  href={`/admin/returns/new?order=${order.id}`}
                  data-testid="start-return"
                >
                  Start a return or exchange
                </Link>
              ) : null}
            </section>
          ) : null}

          {order.status === "CANCELLED" && order.cancelReason !== null ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase">Cancelled</h2>
              <p className="mt-2">
                {CANCEL_REASON_LABELS[order.cancelReason]}
                {order.cancelNote === null ? "" : ` — ${order.cancelNote}`}
              </p>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">
              Staff notes <span className="normal-case">(never shown to the customer)</span>
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {order.notes.map((note) => (
                <li key={note.id}>
                  <p className="whitespace-pre-line">{note.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {dhaka(note.createdAt)} · {name(note.userId)}
                  </p>
                </li>
              ))}
            </ul>
            {actions.note ? <NoteForm orderId={order.id} /> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: "Placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Packing started",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  DELIVERY_FAILED: "Delivery failed",
  RETURNED_TO_WAREHOUSE: "Back in the warehouse",
};

const EVENT_TEXT: Record<string, string> = {
  EDITED: "Edited",
  LOCATION_CHANGED: "Fulfilment location changed",
  PACKED: "Packed",
  UNPACKED: "Packing undone",
  ADDRESS_CORRECTED: "Address corrected",
  COD_SETTLED: "Courier cash recorded",
};
