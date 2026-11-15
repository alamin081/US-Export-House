"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionResult } from "@/modules/access/action-state";
import { CANCEL_REASON_LABELS, CANCEL_REASONS } from "@/modules/orders/order-labels";
import {
  addOrderNoteAction,
  cancelOrderAction,
  changeLocationAction,
  confirmOrderAction,
  logCallAction,
  markDeliveredAction,
  markDeliveryFailedAction,
  receiveReturnedParcelAction,
  shipOrderAction,
  startPackingAction,
  unpackOrderAction,
} from "@/modules/orders/orders.actions";
import type { OrderActions } from "@/modules/orders/orders.service";
import { CALL_OUTCOME_LABELS } from "../order-ui";

interface PanelOrder {
  id: string;
  orderNumber: string;
  status: string;
  version: number;
  totalPoisha: number;
  paidPoisha: number;
  paymentMethod: string | null;
  locationId: string;
  items: ReadonlyArray<{ id: string; sku: string; name: string; quantity: number }>;
}

const field =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground";
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

type Report = (result: ActionResult) => void;

/**
 * Runs an action. Success is reported to the panel (the form that ran it
 * may disappear once the status changes); errors stay next to the form.
 */
function useAction(report?: Report) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (work: () => Promise<ActionResult>, after?: (result: ActionResult) => void) =>
    startTransition(async () => {
      const outcome = await work();
      if (outcome.status === "success" && report !== undefined) {
        setResult(null);
        report(outcome);
      } else {
        setResult(outcome);
      }
      if (outcome.status === "success") router.refresh();
      after?.(outcome);
    });
  return { pending, result, run };
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (result === null || result.status === "idle") return null;
  return (
    <p
      role={result.status === "success" ? "status" : "alert"}
      data-testid="action-feedback"
      className={
        result.status === "success" ? "mt-2 text-sm text-success" : "mt-2 text-sm text-destructive"
      }
    >
      {result.message}
    </p>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background p-4 text-sm">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The steps this staff member may take on the order now, each its own small form. */
export function OrderActionsPanel({
  order,
  actions,
  couriers,
  locations,
  countedCalls,
  unreachableAfter,
}: {
  order: PanelOrder;
  actions: OrderActions;
  couriers: ReadonlyArray<{ key: string; label: string }>;
  locations: ReadonlyArray<{ id: string; code: string; nameEn: string }>;
  countedCalls: number;
  unreachableAfter: number;
}) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const quick = useAction(setNotice);
  const version = { version: order.version };
  const any = Object.entries(actions).some(
    ([key, value]) => value && !["note", "printSlip", "printInvoice", "blockPhone"].includes(key),
  );
  if (!any) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="order-actions">
      <div className="flex flex-wrap gap-2">
        {actions.confirm ? (
          <Button
            type="button"
            disabled={quick.pending}
            onClick={() => quick.run(() => confirmOrderAction(order.id, version))}
            data-testid="confirm-order"
          >
            Confirm order
          </Button>
        ) : null}
        {actions.edit ? (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/admin/orders/${order.id}/edit`}
          >
            Edit items or address
          </Link>
        ) : null}
        {actions.startPacking ? (
          <Button
            type="button"
            variant="outline"
            disabled={quick.pending}
            onClick={() => quick.run(() => startPackingAction(order.id, version))}
            data-testid="start-packing"
          >
            Start packing
          </Button>
        ) : null}
        {actions.pack ? (
          <Link
            className={buttonVariants()}
            href={`/admin/orders/${order.id}/pack`}
            data-testid="open-pack"
          >
            Pack (scan items)
          </Link>
        ) : null}
        {actions.unpack ? (
          <Button
            type="button"
            variant="ghost"
            disabled={quick.pending}
            onClick={() => quick.run(() => unpackOrderAction(order.id, version))}
          >
            Undo packing
          </Button>
        ) : null}
        {actions.deliver ? (
          <Button
            type="button"
            disabled={quick.pending}
            onClick={() => quick.run(() => markDeliveredAction(order.id, version))}
            data-testid="mark-delivered"
          >
            Mark delivered
          </Button>
        ) : null}
      </div>
      <Feedback result={notice} />
      <Feedback result={quick.result} />

      {actions.call ? (
        <CallForm
          report={setNotice}
          orderId={order.id}
          countedCalls={countedCalls}
          unreachableAfter={unreachableAfter}
        />
      ) : null}
      {actions.ship ? <ShipForm report={setNotice} order={order} couriers={couriers} /> : null}
      {actions.deliveryFailed ? <FailedForm report={setNotice} order={order} /> : null}
      {actions.receiveReturn ? (
        <ReturnedForm report={setNotice} order={order} locations={locations} />
      ) : null}
      {actions.changeLocation && locations.length > 1 ? (
        <LocationForm report={setNotice} order={order} locations={locations} />
      ) : null}
      {actions.cancel ? (
        <CancelForm report={setNotice} order={order} canBlock={actions.blockPhone} />
      ) : null}
    </div>
  );
}

function CallForm({
  report,
  orderId,
  countedCalls,
  unreachableAfter,
}: {
  report: Report;
  orderId: string;
  countedCalls: number;
  unreachableAfter: number;
}) {
  const { pending, result, run } = useAction(report);
  const [outcome, setOutcome] = useState("CONFIRMED");
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  return (
    <Panel title="Log a call">
      <form
        className="grid gap-3 sm:grid-cols-[14rem_1fr]"
        data-testid="call-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              logCallAction(orderId, {
                outcome,
                note,
                callbackAt: callbackAt === "" ? "" : new Date(callbackAt).toISOString(),
              }),
            (outcome) => {
              if (outcome.status === "success") {
                setNote("");
                setCallbackAt("");
              }
            },
          );
        }}
      >
        <label className={label}>
          Result
          <select
            className={field}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            name="outcome"
          >
            {Object.entries(CALL_OUTCOME_LABELS).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Note
          <input className={field} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {outcome === "CALL_BACK_LATER" ? (
          <label className={label}>
            Call back at
            <input
              type="datetime-local"
              className={field}
              value={callbackAt}
              onChange={(event) => setCallbackAt(event.target.value)}
            />
          </label>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending}>
            Save call
          </Button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        Unanswered calls counted: {countedCalls} of {unreachableAfter} (calls at least the set
        number of hours apart). The order is never cancelled automatically.
      </p>
      <Feedback result={result} />
    </Panel>
  );
}

function ShipForm({
  report,
  order,
  couriers,
}: {
  report: Report;
  order: PanelOrder;
  couriers: ReadonlyArray<{ key: string; label: string }>;
}) {
  const { pending, result, run } = useAction(report);
  const owed = Math.max(0, order.totalPoisha - order.paidPoisha);
  const [courier, setCourier] = useState(couriers[0]?.key ?? "STEADFAST");
  const [courierName, setCourierName] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [codAmount, setCodAmount] = useState(
    order.paymentMethod === "COD" ? String(owed / 100) : "0",
  );
  const [note, setNote] = useState("");
  return (
    <Panel title={order.status === "DELIVERY_FAILED" ? "Send out again" : "Ship"}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        data-testid="ship-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            shipOrderAction(order.id, {
              version: order.version,
              courier,
              courierName,
              trackingCode,
              codAmount,
              note,
            }),
          );
        }}
      >
        <label className={label}>
          Courier
          <select
            className={field}
            value={courier}
            onChange={(event) => setCourier(event.target.value)}
            name="courier"
          >
            {couriers.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {courier === "OTHER" ? (
          <label className={label}>
            Courier name
            <input
              className={field}
              value={courierName}
              onChange={(event) => setCourierName(event.target.value)}
            />
          </label>
        ) : null}
        <label className={label}>
          Tracking / consignment number
          <input
            className={field}
            name="trackingCode"
            value={trackingCode}
            placeholder={courier === "MANUAL" ? "Optional for own delivery" : ""}
            onChange={(event) => setTrackingCode(event.target.value)}
          />
        </label>
        {order.paymentMethod === "COD" ? (
          <label className={label}>
            Cash to collect (taka)
            <input
              className={field}
              name="codAmount"
              inputMode="decimal"
              value={codAmount}
              onChange={(event) => setCodAmount(event.target.value)}
            />
          </label>
        ) : null}
        <label className={`${label} sm:col-span-2`}>
          Note
          <input className={field} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div>
          <Button type="submit" size="sm" disabled={pending} data-testid="ship-submit">
            Mark shipped
          </Button>
        </div>
      </form>
      {order.status === "PROCESSING" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Shipping takes the items off the shelf and issues the invoice.
        </p>
      ) : null}
      <Feedback result={result} />
    </Panel>
  );
}

function FailedForm({ report, order }: { report: Report; order: PanelOrder }) {
  const { pending, result, run } = useAction(report);
  const [reason, setReason] = useState("");
  return (
    <Panel title="Delivery failed">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => markDeliveryFailedAction(order.id, { version: order.version, reason }));
        }}
      >
        <label className={`${label} min-w-64 flex-1`}>
          Reason (refused, not reachable, wrong address…)
          <input
            className={field}
            value={reason}
            name="failedReason"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Mark delivery failed
        </Button>
      </form>
      <Feedback result={result} />
    </Panel>
  );
}

function ReturnedForm({
  report,
  order,
  locations,
}: {
  report: Report;
  order: PanelOrder;
  locations: ReadonlyArray<{ id: string; code: string; nameEn: string }>;
}) {
  const { pending, result, run } = useAction(report);
  const [locationId, setLocationId] = useState(order.locationId);
  const [damaged, setDamaged] = useState<Record<string, number>>({});
  const [lostCharge, setLostCharge] = useState("");
  const [note, setNote] = useState("");
  return (
    <Panel title="Parcel came back — inspect">
      <form
        className="flex flex-col gap-3"
        data-testid="returned-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            receiveReturnedParcelAction(order.id, {
              version: order.version,
              locationId,
              lostCharge,
              note,
              lines: order.items.map((item) => ({
                orderItemId: item.id,
                damaged: damaged[item.id] ?? 0,
                good: item.quantity - (damaged[item.id] ?? 0),
              })),
            }),
          );
        }}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Units</th>
              <th className="py-1 text-right font-medium">Damaged</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="py-2">
                  {item.name}
                  <span className="block text-xs text-muted-foreground">{item.sku}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={item.quantity}
                    aria-label={`Damaged units of ${item.sku}`}
                    className="h-9 w-20 rounded-md border border-input bg-card px-2 text-right"
                    value={damaged[item.id] ?? 0}
                    onChange={(event) =>
                      setDamaged((current) => ({
                        ...current,
                        [item.id]: Math.max(
                          0,
                          Math.min(item.quantity, Number(event.target.value) || 0),
                        ),
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>
            Back at
            <select
              className={field}
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Courier still charges (taka)
            <input
              className={field}
              inputMode="decimal"
              value={lostCharge}
              onChange={(event) => setLostCharge(event.target.value)}
            />
          </label>
          <label className={label}>
            Note
            <input
              className={field}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Undamaged units go back into stock; damaged ones are written off.
        </p>
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            Receive parcel
          </Button>
        </div>
      </form>
      <Feedback result={result} />
    </Panel>
  );
}

function LocationForm({
  report,
  order,
  locations,
}: {
  report: Report;
  order: PanelOrder;
  locations: ReadonlyArray<{ id: string; code: string; nameEn: string }>;
}) {
  const { pending, result, run } = useAction(report);
  const others = locations.filter((location) => location.id !== order.locationId);
  const [locationId, setLocationId] = useState(others[0]?.id ?? "");
  return (
    <Panel title="Ship from another location">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => changeLocationAction(order.id, { version: order.version, locationId }));
        }}
      >
        <label className={`${label} min-w-56`}>
          Location
          <select
            className={field}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {others.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} — {location.nameEn}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Move order
        </Button>
      </form>
      <Feedback result={result} />
    </Panel>
  );
}

function CancelForm({
  report,
  order,
  canBlock,
}: {
  report: Report;
  order: PanelOrder;
  canBlock: boolean;
}) {
  const { pending, result, run } = useAction(report);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [blockPhone, setBlockPhone] = useState(false);
  return (
    <Panel title="Cancel order">
      <form
        className="flex flex-col gap-3"
        data-testid="cancel-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            cancelOrderAction(order.id, {
              version: order.version,
              reason,
              note,
              blockPhone: reason === "FAKE_ORDER" && blockPhone,
            }),
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Reason
            <select
              className={field}
              value={reason}
              name="cancelReason"
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Choose…</option>
              {CANCEL_REASONS.map((key) => (
                <option key={key} value={key}>
                  {CANCEL_REASON_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Note {reason === "OTHER" ? "(required)" : ""}
            <input
              className={field}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        {reason === "FAKE_ORDER" && canBlock ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={blockPhone}
              onChange={(event) => setBlockPhone(event.target.checked)}
            />
            Also block this phone number from ordering
          </label>
        ) : null}
        <div>
          <Button type="submit" size="sm" variant="destructive" disabled={pending || reason === ""}>
            Cancel order and release stock
          </Button>
        </div>
      </form>
      <Feedback result={result} />
    </Panel>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const { pending, result, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => addOrderNoteAction(orderId, { body }),
          (outcome) => {
            if (outcome.status === "success") setBody("");
          },
        );
      }}
    >
      <textarea
        aria-label="New staff note"
        rows={2}
        className="rounded-md border border-input bg-card px-3 py-2 text-sm"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Add note
        </Button>
      </div>
      <Feedback result={result} />
    </form>
  );
}
