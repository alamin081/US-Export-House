"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { parseTakaInput } from "@/lib/money";
import { receiveStockAction } from "@/modules/inventory/inventory.actions";
import { ScanInput } from "@/modules/inventory/components/scan-input";
import {
  addScanned,
  StockLinesTable,
  type StockLine,
} from "@/modules/inventory/components/stock-lines";

/**
 * Goods from a supplier or factory: location, challan number, items (scanned
 * or picked) with quantity and an optional unit cost. Unit costs are entered
 * here but never shown back to staff without `inventory.cost.read`.
 */
export function ReceiveForm({
  locations,
}: {
  locations: ReadonlyArray<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [kind, setKind] = useState<"PURCHASE" | "OPENING">("PURCHASE");
  const [supplierReference, setSupplierReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<StockLine[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () => {
    const badCost = lines.find(
      (line) =>
        (line.unitCostTaka ?? "").trim() !== "" && parseTakaInput(line.unitCostTaka ?? "") === null,
    );
    if (badCost !== undefined) {
      setMessage({ ok: false, text: `The unit cost for ${badCost.sku} is not a valid amount.` });
      return;
    }
    startTransition(async () => {
      const result = await receiveStockAction({
        locationId,
        kind,
        supplierReference,
        note,
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCostPoisha:
            (line.unitCostTaka ?? "").trim() === ""
              ? null
              : parseTakaInput(line.unitCostTaka ?? ""),
        })),
      });
      if (result.status === "error") {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: result.message });
      setLines([]);
      setSupplierReference("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
        <div>
          <Label htmlFor="receive-location" required>
            Receiving location
          </Label>
          <Select
            id="receive-location"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="receive-kind">Type</Label>
          <Select
            id="receive-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as "PURCHASE" | "OPENING")}
          >
            <option value="PURCHASE">Stock receive (adds to stock)</option>
            <option value="OPENING">Opening stock (items with no history here)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="receive-reference">Supplier challan / invoice no.</Label>
          <Input
            id="receive-reference"
            value={supplierReference}
            onChange={(event) => setSupplierReference(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="receive-note">Note</Label>
          <Input id="receive-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <ScanInput onItem={(item) => setLines((current) => addScanned(current, item))} />
      </div>

      <div className="flex flex-col gap-4">
        <StockLinesTable lines={lines} onChange={setLines} withCost />
        <FieldHint>
          Unit cost is optional (taka, e.g. 1250.50). It updates the item&apos;s average cost.
        </FieldHint>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={
              pending ||
              lines.length === 0 ||
              lines.some((line) => line.quantity <= 0) ||
              locationId === ""
            }
            onClick={submit}
            data-testid="receive-submit"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <PackageCheck aria-hidden="true" />
            )}
            Receive {lines.reduce((total, line) => total + line.quantity, 0)} units
          </Button>
          {message === null ? null : (
            <p
              role={message.ok ? "status" : "alert"}
              className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
