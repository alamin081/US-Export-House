"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatMoney, parseTakaInput } from "@/lib/money";
import { recordCodSettlementAction } from "@/modules/orders/orders.actions";

interface UnsettledOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  deliveredAt: string | null;
  courier: string | null;
  courierText: string;
  trackingCode: string | null;
  expectedPoisha: number;
}

const field = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground";
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

function todayInDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

export function CodForm({
  couriers,
  orders,
}: {
  couriers: ReadonlyArray<{ key: string; label: string }>;
  orders: readonly UnsettledOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [courier, setCourier] = useState(couriers[0]?.key ?? "STEADFAST");
  const [courierName, setCourierName] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayInDhaka);
  const [received, setReceived] = useState("");
  const [charge, setCharge] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const visible = orders.filter((order) => order.courier === null || order.courier === courier);
  const chosen = visible.filter((order) => selected.has(order.id));
  const expected = chosen.reduce((sum, order) => sum + order.expectedPoisha, 0);
  const gross = (parseTakaInput(received) ?? 0) + (parseTakaInput(charge) ?? 0);
  const totals = { expected, difference: gross - expected };

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      data-testid="cod-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await recordCodSettlementAction({
            courier,
            courierName,
            receivedOn,
            received,
            courierCharge: charge,
            courierReference: reference,
            note,
            orders: chosen.map((order) => ({
              orderId: order.id,
              received: overrides[order.id] ?? "",
            })),
          });
          if (result.status === "idle") return;
          setMessage({ ok: result.status === "success", text: result.message });
          if ("recorded" in result && result.recorded === true) {
            setSelected(new Set());
            setOverrides({});
            setReceived("");
            setCharge("");
            setReference("");
            setNote("");
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-3">
        <label className={label}>
          Courier
          <select
            className={field}
            value={courier}
            onChange={(event) => {
              setCourier(event.target.value);
              setSelected(new Set());
            }}
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
          Money arrived on
          <input
            type="date"
            className={field}
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </label>
        <label className={label}>
          Amount received (taka)
          <input
            className={field}
            name="received"
            inputMode="decimal"
            value={received}
            onChange={(event) => setReceived(event.target.value)}
          />
        </label>
        <label className={label}>
          Courier charges kept (taka)
          <input
            className={field}
            name="courierCharge"
            inputMode="decimal"
            value={charge}
            onChange={(event) => setCharge(event.target.value)}
          />
        </label>
        <label className={label}>
          Courier&apos;s reference / invoice no.
          <input
            className={field}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        <label className={label}>
          Note
          <input className={field} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[44rem] text-sm" data-testid="cod-orders">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium">Courier</th>
              <th className="px-3 py-2.5 text-right font-medium">To collect</th>
              <th className="px-3 py-2.5 text-right font-medium">Paid for it (if different)</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No delivered, unpaid cash-on-delivery orders for this courier.
                </td>
              </tr>
            ) : (
              visible.map((order) => (
                <tr key={order.id} className="border-t border-border" data-testid="cod-order">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Include ${order.orderNumber}`}
                      checked={selected.has(order.id)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(order.id)) next.delete(order.id);
                          else next.add(order.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {order.orderNumber}
                    <span className="block text-xs text-muted-foreground">
                      {order.customerName}
                      {order.deliveredAt === null ? "" : ` · delivered ${order.deliveredAt}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {order.courierText}
                    {order.trackingCode === null ? "" : ` · ${order.trackingCode}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(order.expectedPoisha, "en")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      aria-label={`Amount paid for ${order.orderNumber}`}
                      className="h-9 w-28 rounded-md border border-input bg-card px-2 text-right"
                      placeholder="in full"
                      disabled={!selected.has(order.id)}
                      value={overrides[order.id] ?? ""}
                      onChange={(event) =>
                        setOverrides((current) => ({ ...current, [order.id]: event.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span>
          Expected: <strong className="tabular-nums">{formatMoney(totals.expected, "en")}</strong>
        </span>
        <span className={totals.difference === 0 ? "" : "font-semibold text-destructive"}>
          Difference: <span className="tabular-nums">{formatMoney(totals.difference, "en")}</span>
        </span>
      </div>
      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
          data-testid="cod-message"
        >
          {message.text}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || chosen.length === 0}>
          Record courier payment
        </Button>
      </div>
    </form>
  );
}
