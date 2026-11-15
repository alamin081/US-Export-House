"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createStaffReturnAction } from "@/modules/returns/returns.actions";
import { RETURN_REASON_LABELS, RETURN_REASONS } from "@/modules/returns/return-rules";

interface StartItem {
  orderItemId: string;
  sku: string;
  name: string;
  quantity: number;
  returnable: number;
  exchangeOptions: ReadonlyArray<{ variantId: string; label: string; inStock: boolean }>;
}

const field = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground";
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

export function NewReturnForm({
  orderId,
  insideWindow,
  items,
}: {
  orderId: string;
  insideWindow: boolean;
  items: readonly StartItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-6 flex flex-col gap-6"
      data-testid="new-return-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createStaffReturnAction({
            orderId,
            type,
            reasonCode,
            reason,
            outsideWindowNote: note,
            items: items
              .filter((item) => (quantities[item.orderItemId] ?? 0) > 0)
              .map((item) => ({
                orderItemId: item.orderItemId,
                quantity: quantities[item.orderItemId],
                exchangeVariantId: replacements[item.orderItemId] ?? "",
              })),
          });
          if (result.status === "success" && "id" in result && result.id !== undefined) {
            router.push(`/admin/returns/${result.id}`);
          } else if (result.status === "error") {
            setError(result.message);
          }
        });
      }}
    >
      <fieldset className="flex gap-6 text-sm">
        <legend className="sr-only">Type</legend>
        {(["RETURN", "EXCHANGE"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
            />
            {value === "RETURN" ? "Return (refund)" : "Exchange (another size, colour or item)"}
          </label>
        ))}
      </fieldset>

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Units back</th>
            {type === "EXCHANGE" ? <th className="py-2 font-medium">Replace with</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.orderItemId} className="border-t border-border">
              <td className="py-2">
                {item.name}
                <span className="block text-xs text-muted-foreground">
                  {item.sku} · {item.returnable} of {item.quantity} can be returned
                </span>
              </td>
              <td className="py-2 text-right">
                <input
                  type="number"
                  min={0}
                  max={item.returnable}
                  aria-label={`Units of ${item.sku} coming back`}
                  className="h-9 w-20 rounded-md border border-input bg-card px-2 text-right"
                  value={quantities[item.orderItemId] ?? 0}
                  disabled={item.returnable === 0}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.orderItemId]: Math.max(
                        0,
                        Math.min(item.returnable, Number(event.target.value) || 0),
                      ),
                    }))
                  }
                />
              </td>
              {type === "EXCHANGE" ? (
                <td className="py-2 ps-3">
                  <select
                    aria-label={`Replacement for ${item.sku}`}
                    className={field}
                    value={replacements[item.orderItemId] ?? ""}
                    onChange={(event) =>
                      setReplacements((current) => ({
                        ...current,
                        [item.orderItemId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose…</option>
                    {item.exchangeOptions.map((option) => (
                      <option
                        key={option.variantId}
                        value={option.variantId}
                        disabled={!option.inStock}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Reason
          <select
            className={field}
            name="reasonCode"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          >
            <option value="">Choose…</option>
            {RETURN_REASONS.map((value) => (
              <option key={value} value={value}>
                {RETURN_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Details
          <input
            className={field}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {insideWindow ? null : (
          <label className={`${label} sm:col-span-2`}>
            Why it is accepted after the window (required)
            <input
              className={field}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        )}
      </div>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          Create request
        </Button>
      </div>
    </form>
  );
}
