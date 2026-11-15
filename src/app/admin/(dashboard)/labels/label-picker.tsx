"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScanInput, type ScannedItem } from "@/modules/inventory/components/scan-input";
import { generateMissingBarcodesAction } from "@/modules/labels/labels.actions";

export function LabelPicker({ missingBarcodes }: { missingBarcodes: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<Array<{ item: ScannedItem; quantity: number }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const items = lines.map((line) => `${line.item.variantId}:${line.quantity}`).join(",");

  return (
    <div className="mt-6 flex flex-col gap-6">
      {missingBarcodes > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent bg-accent/20 p-3 text-sm">
          <span>{missingBarcodes} variant(s) have no barcode yet.</span>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            data-testid="generate-barcodes"
            onClick={() =>
              startTransition(async () => {
                const result = await generateMissingBarcodesAction();
                if (result.status !== "idle") setMessage(result.message);
                router.refresh();
              })
            }
          >
            Generate missing barcodes
          </Button>
        </div>
      ) : null}
      {message === null ? null : <p role="status">{message}</p>}

      <div className="max-w-md">
        <ScanInput
          label="Add an item (scan, SKU or name)"
          onItem={(item) =>
            setLines((current) =>
              current.some((line) => line.item.variantId === item.variantId)
                ? current.map((line) =>
                    line.item.variantId === item.variantId
                      ? { ...line, quantity: line.quantity + 1 }
                      : line,
                  )
                : [...current, { item, quantity: 1 }],
            )
          }
        />
      </div>
      <table className="w-full text-sm" data-testid="label-lines">
        <tbody>
          {lines.map((line) => (
            <tr key={line.item.variantId} className="border-t border-border">
              <td className="py-2">
                {line.item.name}
                <span className="block text-xs text-muted-foreground">
                  {line.item.sku} · {line.item.barcode ?? "no barcode yet"}
                </span>
              </td>
              <td className="w-32 py-2 text-right">
                <input
                  type="number"
                  min={0}
                  max={500}
                  aria-label={`Labels for ${line.item.sku}`}
                  className="h-9 w-20 rounded-md border border-input bg-card px-2 text-right"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current
                        .map((row) =>
                          row.item.variantId === line.item.variantId
                            ? {
                                ...row,
                                quantity: Math.max(
                                  0,
                                  Math.min(500, Number(event.target.value) || 0),
                                ),
                              }
                            : row,
                        )
                        .filter((row) => row.quantity > 0),
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length === 0 ? null : (
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            className="inline-flex items-center gap-1.5 underline"
            href={`/admin/print/labels?items=${items}`}
            target="_blank"
            rel="noreferrer"
            data-testid="print-labels"
          >
            <Printer aria-hidden="true" className="size-4" />
            Thermal labels
          </a>
          <a
            className="inline-flex items-center gap-1.5 underline"
            href={`/admin/print/labels?items=${items}&sheet=a4`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer aria-hidden="true" className="size-4" />
            A4 sticker sheet
          </a>
        </div>
      )}
    </div>
  );
}
