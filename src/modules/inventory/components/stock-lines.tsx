"use client";

import { Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ScannedItem } from "./scan-input";

export interface StockLine {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Taka as typed (receive screen only). */
  unitCostTaka?: string;
}

/** Adds a scanned item, or bumps its quantity by one if it is already listed. */
export function addScanned(lines: readonly StockLine[], item: ScannedItem): StockLine[] {
  const existing = lines.find((line) => line.variantId === item.variantId);
  if (existing !== undefined) {
    return lines.map((line) =>
      line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }
  return [...lines, { variantId: item.variantId, sku: item.sku, name: item.name, quantity: 1 }];
}

/** Editable list of scanned / picked items with quantities (and cost). */
export function StockLinesTable({
  lines,
  onChange,
  withCost = false,
}: {
  lines: readonly StockLine[];
  onChange: (lines: StockLine[]) => void;
  withCost?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No items yet. Scan a barcode or type a SKU above.
      </p>
    );
  }
  const update = (variantId: string, patch: Partial<StockLine>) =>
    onChange(lines.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-sm" data-testid="stock-lines">
        <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="w-28 px-3 py-2 font-medium">Quantity</th>
            {withCost ? <th className="w-36 px-3 py-2 font-medium">Unit cost (৳)</th> : null}
            <th className="w-12 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.variantId} className="border-t border-border">
              <td className="px-3 py-2">
                <span className="block font-medium tabular-nums">{line.sku}</span>
                <span className="text-xs text-muted-foreground">{line.name}</span>
              </td>
              <td className="px-3 py-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={line.quantity}
                  aria-label={`Quantity of ${line.sku}`}
                  onChange={(event) =>
                    update(line.variantId, {
                      quantity: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                    })
                  }
                />
              </td>
              {withCost ? (
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    value={line.unitCostTaka ?? ""}
                    placeholder="optional"
                    aria-label={`Unit cost of ${line.sku}`}
                    onChange={(event) =>
                      update(line.variantId, { unitCostTaka: event.target.value })
                    }
                  />
                </td>
              ) : null}
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={`Remove ${line.sku}`}
                  onClick={() =>
                    onChange(lines.filter((other) => other.variantId !== line.variantId))
                  }
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-secondary/40 text-xs">
          <tr>
            <td className="px-3 py-2 font-medium">{lines.length} item(s)</td>
            <td className="px-3 py-2 font-medium tabular-nums">
              {lines.reduce((total, line) => total + line.quantity, 0)} units
            </td>
            <td colSpan={withCost ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
