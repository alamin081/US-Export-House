"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { shipOrdersAction } from "@/modules/orders/orders.actions";
import { dhaka, StatusBadge } from "./order-ui";

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  customerName: string;
  customerPhone: string;
  totalPoisha: number;
  zoneName: string | null;
  district: string | null;
  couponCode: string | null;
  review: boolean;
  unreachable: boolean;
  packed: boolean;
  placedAt: string;
  locationCode: string;
  lines: number;
  calls: number;
}

type ShipResult =
  | { orderId: string; ok: true; orderNumber: string; invoiceNumber: string | null }
  | { orderId: string; ok: false; message: string };

/**
 * The order list with selection. Selected orders can have their packing
 * slips printed together, or be shipped together with one courier — each
 * order in its own transaction, failures listed with the reason.
 */
export function OrdersTable({
  rows,
  canShip,
  canPrint,
  couriers,
}: {
  rows: readonly OrderRow[];
  canShip: boolean;
  canPrint: boolean;
  couriers: ReadonlyArray<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shipping, setShipping] = useState(false);
  const [courier, setCourier] = useState(couriers[0]?.key ?? "STEADFAST");
  const [courierName, setCourierName] = useState("");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ShipResult[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = rows.filter((row) => selected.has(row.id));
  const shippable = chosen.filter((row) => row.status === "PROCESSING" && row.packed);
  const numberOf = (id: string) => rows.find((row) => row.id === id)?.orderNumber ?? id;

  return (
    <div className="mt-6">
      {selected.size > 0 ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/40 px-4 py-2 text-sm"
          data-testid="bulk-bar"
        >
          <span>{selected.size} selected</span>
          {canPrint ? (
            <a
              className="inline-flex items-center gap-1.5 underline"
              href={`/admin/print/orders/packing-slips?ids=${chosen.map((row) => row.id).join(",")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Printer aria-hidden="true" className="size-4" />
              Packing slips
            </a>
          ) : null}
          {canPrint ? (
            <a
              className="inline-flex items-center gap-1.5 underline"
              href={`/admin/print/orders/address-labels?ids=${chosen.map((row) => row.id).join(",")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Printer aria-hidden="true" className="size-4" />
              Address labels
            </a>
          ) : null}
          {canShip ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={shippable.length === 0}
              onClick={() => {
                setShipping(true);
                setResults(null);
              }}
              data-testid="bulk-ship-open"
            >
              <Truck aria-hidden="true" />
              Ship {shippable.length} packed
            </Button>
          ) : null}
          <button type="button" className="underline" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}

      {shipping ? (
        <form
          className="mb-4 rounded-lg border border-border bg-background p-4 text-sm"
          data-testid="bulk-ship-form"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await shipOrdersAction({
                courier,
                courierName,
                orders: shippable.map((row) => ({
                  orderId: row.id,
                  trackingCode: tracking[row.id] ?? "",
                })),
              });
              setMessage(
                result.status === "idle"
                  ? null
                  : { ok: result.status === "success", text: result.message },
              );
              if ("results" in result && result.results !== undefined) setResults(result.results);
              setSelected(new Set());
              router.refresh();
            });
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Courier
              <select
                className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                value={courier}
                onChange={(event) => setCourier(event.target.value)}
              >
                {couriers.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {courier === "OTHER" ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Courier name
                <input
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
                  value={courierName}
                  onChange={(event) => setCourierName(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <table className="mt-3 w-full max-w-xl text-sm">
            <tbody>
              {shippable.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pe-3 font-medium tabular-nums">{row.orderNumber}</td>
                  <td className="py-2">
                    <input
                      aria-label={`Tracking number for ${row.orderNumber}`}
                      placeholder={courier === "MANUAL" ? "Optional" : "Tracking / consignment no."}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={tracking[row.id] ?? ""}
                      onChange={(event) =>
                        setTracking((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Each order ships on its own: stock leaves the shelf and its invoice is issued. Orders
            not packed yet are left out.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Ship
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShipping(false)}>
              Close
            </Button>
          </div>
        </form>
      ) : null}

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "mb-2 text-sm text-success" : "mb-2 text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}
      {results === null ? null : (
        <ul className="mb-4 text-sm" data-testid="bulk-ship-results">
          {results.map((result) => (
            <li key={result.orderId} className={result.ok ? "text-success" : "text-destructive"}>
              {result.ok
                ? `${result.orderNumber}: shipped${result.invoiceNumber === null ? "" : ` (${result.invoiceNumber})`}`
                : `${numberOf(result.orderId)}: ${result.message}`}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[60rem] text-sm" data-testid="orders-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? new Set(rows.map((row) => row.id)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium">Placed</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Delivery</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No orders found.
                </td>
              </tr>
            ) : (
              rows.map((order) => (
                <tr key={order.id} className="border-t border-border" data-testid="order-row">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${order.orderNumber}`}
                      checked={selected.has(order.id)}
                      onChange={() => toggle(order.id)}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium tabular-nums">
                    <Link className="hover:underline" href={`/admin/orders/${order.id}`}>
                      {order.orderNumber}
                    </Link>
                    <span className="ms-1 flex flex-wrap gap-1">
                      {order.review ? (
                        <Badge variant="accent" data-testid="review-badge">
                          Review
                        </Badge>
                      ) : null}
                      {order.unreachable ? (
                        <Badge variant="destructive" data-testid="unreachable-badge">
                          Unreachable
                        </Badge>
                      ) : null}
                      {order.status === "PROCESSING" && order.packed ? (
                        <Badge variant="success">Packed</Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {dhaka(order.placedAt)}
                    {order.calls > 0 ? (
                      <span className="block">
                        {order.calls} call{order.calls === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {order.customerName}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {order.customerPhone}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {order.zoneName ?? "—"}
                    <span className="block text-muted-foreground">
                      {order.district} · from {order.locationCode}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={order.status} />
                    <span className="ms-1 text-xs text-muted-foreground">
                      {order.paymentMethod ?? ""} {order.paymentStatus.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatMoney(order.totalPoisha, "en")}
                    <span className="block text-xs text-muted-foreground">
                      {order.lines} line{order.lines === 1 ? "" : "s"}
                      {order.couponCode === null ? "" : ` · ${order.couponCode}`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
