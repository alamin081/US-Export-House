"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import type { ActionResult } from "@/modules/access/action-state";
import {
  approveReturnAction,
  closeReturnAction,
  inspectReturnAction,
  receiveReturnAction,
  recordRefundAction,
  rejectReturnAction,
} from "@/modules/returns/returns.actions";
import { REFUND_METHOD_LABELS, REFUND_METHODS } from "@/modules/returns/return-rules";

const field = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground";
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

/** The next step of a return, one small form at a time. */
export function ReturnSteps({
  returnId,
  status,
  type,
  items,
  locations,
  defaultLocationId,
  outstandingPoisha,
  canRecordRefund,
  refundPending,
}: {
  returnId: string;
  status: string;
  type: string;
  items: ReadonlyArray<{ id: string; sku: string; name: string; quantity: number }>;
  locations: ReadonlyArray<{ id: string; label: string }>;
  defaultLocationId: string;
  outstandingPoisha: number;
  canRecordRefund: boolean;
  refundPending: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [locationId, setLocationId] = useState(
    locations.some((location) => location.id === defaultLocationId)
      ? defaultLocationId
      : (locations[0]?.id ?? ""),
  );
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("BKASH");
  const [reference, setReference] = useState("");

  const run = (work: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const outcome = await work();
      setResult(outcome);
      if (outcome.status === "success") router.refresh();
    });

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4 text-sm"
      data-testid="return-steps"
    >
      {status === "REQUESTED" ? (
        <div className="flex flex-col gap-3">
          <p>
            {type === "EXCHANGE"
              ? "Approving creates the replacement order straight away (stock is reserved)."
              : "Approve when the item may come back; refuse with a reason otherwise."}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveReturnAction(returnId))}
              data-testid="approve-return"
            >
              Approve
            </Button>
            <label className={`${label} min-w-64 flex-1`}>
              Reason to refuse
              <input
                className={field}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => rejectReturnAction(returnId, { reason: rejectReason }))}
            >
              Refuse
            </Button>
          </div>
        </div>
      ) : null}

      {status === "APPROVED" ? (
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => receiveReturnAction(returnId))}
            data-testid="receive-return"
          >
            The item has arrived
          </Button>
        </div>
      ) : null}

      {status === "RECEIVED" ? (
        <form
          className="flex flex-col gap-3"
          data-testid="inspect-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              inspectReturnAction(returnId, {
                locationId,
                items: items.map((item) => ({
                  returnItemId: item.id,
                  result: verdicts[item.id] ?? "ACCEPTED",
                })),
              }),
            );
          }}
        >
          <p className="font-medium">Inspect each item</p>
          {items.map((item) => (
            <label key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {item.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {item.sku} × {item.quantity}
                </span>
              </span>
              <select
                aria-label={`Result for ${item.sku}`}
                className="h-9 rounded-md border border-input bg-card px-2"
                value={verdicts[item.id] ?? "ACCEPTED"}
                onChange={(event) =>
                  setVerdicts((current) => ({ ...current, [item.id]: event.target.value }))
                }
              >
                <option value="ACCEPTED">Sellable — back into stock</option>
                <option value="DAMAGED">Damaged — write off</option>
                <option value="REJECTED">Not accepted (used, washed, no tags…)</option>
              </select>
            </label>
          ))}
          <label className={`${label} max-w-sm`}>
            Restock at
            <select
              className={field}
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Button type="submit" disabled={pending} data-testid="inspect-submit">
              Save inspection
            </Button>
          </div>
        </form>
      ) : null}

      {status === "INSPECTED" ? (
        <div className="flex flex-col gap-3">
          {outstandingPoisha > 0 || refundPending ? (
            refundPending ? (
              <p>A refund is waiting for a manager&apos;s approval.</p>
            ) : canRecordRefund ? (
              <form
                className="grid gap-3 sm:grid-cols-3"
                data-testid="refund-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => recordRefundAction(returnId, { method, reference }));
                }}
              >
                <p className="sm:col-span-3">
                  To refund:{" "}
                  <strong className="tabular-nums">{formatMoney(outstandingPoisha, "en")}</strong>
                  {type === "RETURN"
                    ? " (plus the delivery charge if the item was defective or wrong)"
                    : ""}
                  . Send the money first, then record it here.
                </p>
                <label className={label}>
                  Sent by
                  <select
                    className={field}
                    name="method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                  >
                    {REFUND_METHODS.map((value) => (
                      <option key={value} value={value}>
                        {REFUND_METHOD_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Transaction / reference no.
                  <input
                    className={field}
                    name="reference"
                    value={reference}
                    placeholder={method === "CASH" ? "Not needed for cash" : ""}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={pending} data-testid="refund-submit">
                    Record refund
                  </Button>
                </div>
              </form>
            ) : (
              <p>A refund is due; someone with refund.record must record it.</p>
            )
          ) : (
            <p>Nothing more to refund.</p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => closeReturnAction(returnId))}
              data-testid="close-return"
            >
              Close the return
            </Button>
          </div>
        </div>
      ) : null}

      {["COMPLETED", "REJECTED", "CANCELLED"].includes(status) ? (
        <p className="text-muted-foreground">Nothing more to do.</p>
      ) : null}

      {result === null || result.status === "idle" ? null : (
        <p
          role={result.status === "success" ? "status" : "alert"}
          data-testid="return-feedback"
          className={result.status === "success" ? "text-success" : "text-destructive"}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
