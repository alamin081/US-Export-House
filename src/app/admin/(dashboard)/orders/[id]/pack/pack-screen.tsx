"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScanInput, type ScannedItem } from "@/modules/inventory/components/scan-input";
import { markPackedAction } from "@/modules/orders/orders.actions";

interface PackItem {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
}

/**
 * Packing check. A scan of an item that is not on the order — or one more
 * than ordered — is refused with a warning and never counted. "Packing
 * complete" unlocks only when every line matches; the server checks again.
 */
export function PackScreen({
  orderId,
  version,
  items,
}: {
  orderId: string;
  version: number;
  items: readonly PackItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const complete = items.every((item) => (counted[item.variantId] ?? 0) === item.quantity);

  const bump = (variantId: string, delta: number) =>
    setCounted((current) => {
      const item = items.find((row) => row.variantId === variantId)!;
      const next = Math.max(0, Math.min(item.quantity, (current[variantId] ?? 0) + delta));
      return { ...current, [variantId]: next };
    });

  const onItem = (scanned: ScannedItem) => {
    const item = items.find((row) => row.variantId === scanned.variantId);
    if (item === undefined) throw new Error(`Wrong item: ${scanned.sku} is not on this order.`);
    if ((counted[item.variantId] ?? 0) >= item.quantity) {
      throw new Error(`Too many: only ${item.quantity} × ${item.sku} on this order.`);
    }
    bump(item.variantId, 1);
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="max-w-md">
        <ScanInput onItem={onItem} />
      </div>
      <table className="w-full text-sm" data-testid="pack-table">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Packed / ordered</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const done = (counted[item.variantId] ?? 0) === item.quantity;
            return (
              <tr
                key={item.variantId}
                className={cn("border-t border-border", done && "bg-success/10")}
                data-testid="pack-line"
                data-done={done}
              >
                <td className="py-3">
                  {item.name}
                  <span className="block text-xs text-muted-foreground">{item.sku}</span>
                </td>
                <td className="py-3 text-right text-base tabular-nums">
                  {counted[item.variantId] ?? 0} / {item.quantity}
                </td>
                <td className="w-28 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="iconSm"
                      variant="outline"
                      aria-label={`One less ${item.sku}`}
                      onClick={() => bump(item.variantId, -1)}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="iconSm"
                      variant="outline"
                      aria-label={`Count one ${item.sku} by hand`}
                      onClick={() => bump(item.variantId, 1)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}
      <div>
        <Button
          type="button"
          disabled={!complete || pending}
          data-testid="pack-complete"
          onClick={() =>
            startTransition(async () => {
              const result = await markPackedAction(orderId, {
                version,
                counted: items.map((item) => ({
                  variantId: item.variantId,
                  quantity: counted[item.variantId] ?? 0,
                })),
              });
              if (result.status === "success") {
                router.push(`/admin/orders/${orderId}`);
                router.refresh();
              } else if (result.status === "error") {
                setMessage({ ok: false, text: result.message });
              }
            })
          }
        >
          <CheckCircle2 aria-hidden="true" />
          Packing complete
        </Button>
      </div>
    </div>
  );
}
