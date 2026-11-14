"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, PackageCheck, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  cancelTransferAction,
  receiveTransferAction,
  transferStepAction,
} from "@/modules/inventory/inventory.actions";
import { ScanInput } from "@/modules/inventory/components/scan-input";

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  if (message === null) return null;
  return (
    <p
      role={message.ok ? "status" : "alert"}
      data-testid="transfer-message"
      className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
    >
      {message.text}
    </p>
  );
}

/** Approve / dispatch / cancel buttons, shown only when the caller may use them. */
export function TransferButtons({
  transferId,
  can,
}: {
  transferId: string;
  can: { approve: boolean; dispatch: boolean; cancel: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const run = (work: () => Promise<{ status: "success" | "error"; message: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.status === "success", text: result.message });
      if (result.status === "success") router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {can.approve ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => transferStepAction("approve", transferId))}
          >
            <CheckCheck aria-hidden="true" />
            Approve
          </Button>
        ) : null}
        {can.dispatch ? (
          <Button
            type="button"
            disabled={pending}
            data-testid="transfer-dispatch"
            onClick={() => {
              if (window.confirm("Dispatch now? The stock leaves the sending location.")) {
                run(() => transferStepAction("dispatch", transferId));
              }
            }}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Dispatch
          </Button>
        ) : null}
        {can.cancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setCancelling((value) => !value)}
          >
            <XCircle aria-hidden="true" />
            Cancel transfer
          </Button>
        ) : null}
      </div>
      {cancelling ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder="Why is it cancelled?"
            aria-label="Cancellation reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
          <Button
            type="button"
            variant="destructive"
            disabled={pending || cancelReason.trim().length < 3}
            onClick={() => run(() => cancelTransferAction({ transferId, reason: cancelReason }))}
          >
            Confirm cancel
          </Button>
        </div>
      ) : null}
      <Feedback message={message} />
    </div>
  );
}

interface ReceiveItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  quantitySent: number;
}

const REASONS = [
  { value: "LOST", label: "Lost in transit" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
] as const;

/**
 * The receiving side records what arrived: sent vs received per line. Scans
 * count items up; anything short needs a reason, anything over is recorded as
 * an excess and flagged for a count at the sending location.
 */
export function ReceiveTransferForm({
  transferId,
  items,
}: {
  transferId: string;
  items: readonly ReceiveItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(items.map((item) => [item.id, String(item.quantitySent)])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [scanMode, setScanMode] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const startScanning = () => {
    setScanMode(true);
    setReceived(Object.fromEntries(items.map((item) => [item.id, "0"])));
  };

  const submit = () =>
    startTransition(async () => {
      const result = await receiveTransferAction({
        transferId,
        lines: items.map((item) => ({
          itemId: item.id,
          quantityReceived: Number(received[item.id] ?? 0),
          reason: (reasons[item.id] ?? "") === "" ? null : reasons[item.id],
        })),
      });
      setMessage({ ok: result.status === "success", text: result.message });
      if (result.status === "success") router.refresh();
    });

  return (
    <div className="flex flex-col gap-4" data-testid="receive-transfer-form">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {scanMode ? (
          <div className="w-full max-w-md">
            <ScanInput
              label="Scan what arrived"
              onItem={(scanned) => {
                const item = items.find((candidate) => candidate.variantId === scanned.variantId);
                if (item === undefined) throw new Error(`${scanned.sku} is not on this transfer.`);
                setReceived((current) => ({
                  ...current,
                  [item.id]: String(Number(current[item.id] ?? 0) + 1),
                }));
              }}
            />
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={startScanning}>
            Count by scanning (starts every line at 0)
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Sent</th>
              <th className="w-28 px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const value = Number(received[item.id] ?? 0);
              const difference = value - item.quantitySent;
              return (
                <tr key={item.id} className="border-t border-border" data-sku={item.sku}>
                  <td className="px-3 py-2">
                    <span className="block font-medium tabular-nums">{item.sku}</span>
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.quantitySent}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`Received ${item.sku}`}
                      value={received[item.id] ?? ""}
                      onChange={(event) =>
                        setReceived((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {difference === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : difference > 0 ? (
                      <span className="text-sm">
                        +{difference} excess — ask the sender to count
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-destructive tabular-nums">{difference}</span>
                        <Select
                          className="h-9 w-40"
                          aria-label={`Reason for ${item.sku}`}
                          value={reasons[item.id] ?? ""}
                          onChange={(event) =>
                            setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                        >
                          <option value="">Choose a reason…</option>
                          {REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </Select>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={submit} data-testid="transfer-receive">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <PackageCheck aria-hidden="true" />
          )}
          Receive transfer
        </Button>
        <Feedback message={message} />
      </div>
    </div>
  );
}
