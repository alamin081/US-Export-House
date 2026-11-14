"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveTransferDraftAction } from "@/modules/inventory/inventory.actions";
import { ScanInput } from "@/modules/inventory/components/scan-input";
import {
  addScanned,
  StockLinesTable,
  type StockLine,
} from "@/modules/inventory/components/stock-lines";

export interface TransferLocationOption {
  id: string;
  code: string;
  nameEn: string;
  isSample: boolean;
  mine: boolean;
}

/** Create a draft transfer, or edit one that has not been dispatched. */
export function TransferDraftForm({
  locations,
  initial,
}: {
  locations: readonly TransferLocationOption[];
  initial?: {
    id: string;
    fromLocationId: string;
    toLocationId: string;
    note: string;
    lines: StockLine[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const mine = locations.filter((location) => location.mine);
  const [fromLocationId, setFrom] = useState(initial?.fromLocationId ?? mine[0]?.id ?? "");
  const [toLocationId, setTo] = useState(
    initial?.toLocationId ??
      locations.find((location) => location.id !== (mine[0]?.id ?? ""))?.id ??
      "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [lines, setLines] = useState<StockLine[]>(initial?.lines ?? []);
  const [message, setMessage] = useState<string | null>(null);

  const label = (location: TransferLocationOption) =>
    `${location.code} · ${location.nameEn}${location.isSample ? " (sample)" : ""}`;

  const save = () =>
    startTransition(async () => {
      const result = await saveTransferDraftAction({
        ...(initial === undefined ? {} : { id: initial.id }),
        fromLocationId,
        toLocationId,
        note,
        lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      router.push(`/admin/transfers/${result.data.id}`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
        <div>
          <Label htmlFor="transfer-from" required>
            From (sends)
          </Label>
          <Select
            id="transfer-from"
            value={fromLocationId}
            onChange={(event) => setFrom(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {label(location)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="transfer-to" required>
            To (receives)
          </Label>
          <Select
            id="transfer-to"
            value={toLocationId}
            onChange={(event) => setTo(event.target.value)}
          >
            {locations
              .filter((location) => location.id !== fromLocationId)
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {label(location)}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="transfer-note">Note</Label>
          <Input
            id="transfer-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <ScanInput onItem={(item) => setLines((current) => addScanned(current, item))} />
      </div>

      <div className="flex flex-col gap-4">
        <StockLinesTable lines={lines} onChange={setLines} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={
              pending ||
              lines.length === 0 ||
              fromLocationId === toLocationId ||
              toLocationId === ""
            }
            onClick={save}
            data-testid="transfer-save"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save draft
          </Button>
          {message === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
