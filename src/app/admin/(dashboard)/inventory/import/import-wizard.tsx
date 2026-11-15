"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Loader2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { applyImportAction, previewImportAction } from "@/modules/inventory/inventory.actions";
import type { ImportPreview } from "@/modules/inventory/inventory.service";

function taka(poisha: number | null) {
  return poisha === null
    ? ""
    : `৳${(poisha / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

/**
 * Step 1: choose the type and the file, preview (nothing is saved). Step 2:
 * apply — all rows in one transaction, or none. The same file twice needs an
 * explicit tick.
 */
export function ImportWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"OPENING" | "PURCHASE">("OPENING");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const form = () => {
    const data = new FormData();
    if (file !== null) data.set("file", file);
    data.set("mode", mode);
    return data;
  };

  const runPreview = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await previewImportAction(form());
      if (result.status === "error") {
        setPreview(null);
        setMessage({ ok: false, text: result.message });
        return;
      }
      setPreview(result.data);
      setConfirmDuplicate(false);
    });

  const apply = () =>
    startTransition(async () => {
      if (preview === null) return;
      const data = form();
      data.set("sha256", preview.sha256);
      data.set("confirmDuplicate", String(confirmDuplicate));
      const result = await applyImportAction(data);
      if (result.status === "error") {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: result.message });
      setPreview(null);
      setFile(null);
      router.refresh();
    });

  const counts =
    preview === null
      ? null
      : {
          new: preview.lines.filter((line) => line.status === "new").length,
          change: preview.lines.filter((line) => line.status === "change").length,
          error: preview.lines.filter((line) => line.status === "error").length,
        };

  return (
    // Marks a page where staff with inventory.receive type purchase costs
    // (allowed by scripts/check-client-bundle.ts).
    <div className="flex flex-col gap-6" data-cost-entry="inventory.receive">
      <div className="grid gap-4 rounded-lg border border-border bg-background p-5 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <Label htmlFor="import-mode" required>
            Import type
          </Label>
          <Select
            id="import-mode"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as "OPENING" | "PURCHASE");
              setPreview(null);
            }}
          >
            <option value="OPENING">Opening stock (first stock; no history)</option>
            <option value="PURCHASE">Stock receive (adds to stock)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="import-file" required>
            CSV file
          </Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            data-testid="import-file"
            className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-2 file:text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || file === null}
          onClick={runPreview}
          data-testid="import-preview"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          Preview (dry run)
        </Button>
      </div>

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          data-testid="import-message"
          className={
            message.ok ? "flex items-center gap-2 text-sm text-success" : "text-sm text-destructive"
          }
        >
          {message.ok ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
          {message.text}
        </p>
      )}

      {preview === null || counts === null ? null : (
        <section className="flex flex-col gap-4" data-testid="import-result">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <strong>{preview.fileName}</strong>
            <span className="text-muted-foreground">
              {preview.dataRows} rows · separator “
              {preview.delimiter === "\t" ? "tab" : preview.delimiter}” · {preview.lines.length}{" "}
              lines · {preview.totalQuantity} units
            </span>
            <Badge variant="success">{counts.new} new</Badge>
            <Badge variant="outline">{counts.change} adds to existing</Badge>
            {preview.errors.length > 0 ? (
              <Badge variant="destructive">{preview.errors.length} errors</Badge>
            ) : null}
          </div>

          {preview.errors.length === 0 ? null : (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p className="font-medium text-destructive">
                Fix these rows in the file, then preview again. Nothing will be saved while any row
                is wrong.
              </p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                {preview.errors.slice(0, 100).map((error, index) => (
                  <li key={index}>
                    {error.row === null ? "File" : `Row ${error.row}`}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.warnings.length === 0 ? null : (
            <ul className="rounded-md border border-border bg-secondary/50 p-4 text-sm">
              {preview.warnings.map((warning, index) => (
                <li key={index}>
                  {warning.row === null ? "" : `Row ${warning.row}: `}
                  {warning.message}
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full min-w-[48rem] text-sm" data-testid="import-preview-table">
              <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Rows</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">SKU / item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-3 py-2 text-right font-medium">On hand now → after</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{line.rows.join(", ")}</td>
                    <td className="px-3 py-2">{line.locationCode}</td>
                    <td className="px-3 py-2">
                      <span className="block tabular-nums">{line.sku}</span>
                      <span className="text-xs text-muted-foreground">
                        {line.productName ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {taka(line.unitCostPoisha)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.currentOnHand === null
                        ? "—"
                        : `${line.currentOnHand} → ${line.newOnHand}`}
                    </td>
                    <td className="px-3 py-2">
                      {line.status === "error" ? (
                        <span className="text-destructive">{line.message}</span>
                      ) : line.status === "new" ? (
                        <Badge variant="success">New</Badge>
                      ) : (
                        <Badge variant="outline">Adds</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.previousImports.length === 0 ? null : (
            <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <Checkbox
                checked={confirmDuplicate}
                onChange={(event) => setConfirmDuplicate(event.target.checked)}
                data-testid="import-confirm-duplicate"
              />
              This exact file was imported before (
              {preview.previousImports.map((receipt) => receipt.reference).join(", ")}). Import it
              again and add the stock a second time.
            </label>
          )}

          <div>
            <Button
              type="button"
              disabled={
                pending ||
                !preview.canApply ||
                (preview.previousImports.length > 0 && !confirmDuplicate)
              }
              onClick={apply}
              data-testid="import-apply"
            >
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              Apply {preview.totalQuantity} units
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
