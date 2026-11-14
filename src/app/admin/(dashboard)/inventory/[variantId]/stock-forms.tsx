"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adjustStockAction, setThresholdAction } from "@/modules/inventory/inventory.actions";

const REASONS = [
  { value: "DAMAGED", label: "Damaged (remove)" },
  { value: "LOST", label: "Lost (remove)" },
  { value: "FOUND", label: "Found (add)" },
  { value: "CORRECTION", label: "Correction of a wrong entry" },
  { value: "OTHER", label: "Other (note required)" },
] as const;

/**
 * Manual adjustment with a reason. Large changes (above the setting) need a
 * tick before they go through; damaged / lost only remove, found only adds.
 */
export function AdjustForm({
  variantId,
  locations,
  confirmAbove,
}: {
  variantId: string;
  locations: ReadonlyArray<{ id: string; code: string; available: number }>;
  confirmAbove: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("DAMAGED");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const quantity = Math.trunc(Number(amount) || 0);
  const delta = direction === "remove" ? -quantity : quantity;
  const large = Math.abs(delta) > confirmAbove;

  const submit = () =>
    startTransition(async () => {
      const result = await adjustStockAction({
        variantId,
        locationId,
        delta,
        reason,
        note,
        confirmed,
      });
      if (result.status === "error") {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: result.message });
      setAmount("");
      setNote("");
      setConfirmed(false);
      router.refresh();
    });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      data-testid="adjust-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <Label htmlFor="adjust-location" required>
          Location
        </Label>
        <Select
          id="adjust-location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} (available {location.available})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="adjust-reason" required>
          Reason
        </Label>
        <Select
          id="adjust-reason"
          value={reason}
          onChange={(event) => {
            const next = event.target.value as (typeof REASONS)[number]["value"];
            setReason(next);
            if (next === "FOUND") setDirection("add");
            if (next === "DAMAGED" || next === "LOST") setDirection("remove");
          }}
        >
          {REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="adjust-direction">Change</Label>
        <Select
          id="adjust-direction"
          value={direction}
          onChange={(event) => setDirection(event.target.value as "remove" | "add")}
        >
          <option value="remove">Remove units</option>
          <option value="add">Add units</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="adjust-amount" required>
          Units
        </Label>
        <Input
          id="adjust-amount"
          name="amount"
          type="number"
          min={1}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="adjust-note" required={reason === "OTHER"}>
          Note
        </Label>
        <Textarea
          id="adjust-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {large ? (
        <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm sm:col-span-2">
          <Checkbox
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            data-testid="confirm-large-adjustment"
          />
          This changes stock by {Math.abs(delta)} units (more than {confirmAbove}). I have checked
          the number.
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button
          type="submit"
          disabled={pending || quantity <= 0 || locationId === ""}
          data-testid="adjust-submit"
        >
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Save adjustment
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
    </form>
  );
}

/** Per-location low-stock threshold; empty means "use the global setting". */
export function ThresholdInput({
  variantId,
  locationId,
  value,
  globalDefault,
}: {
  variantId: string;
  locationId: string;
  value: number | null;
  globalDefault: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = draft !== (value === null ? "" : String(value));

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        className="h-9 w-20 text-right"
        inputMode="numeric"
        value={draft}
        placeholder={String(globalDefault)}
        aria-label="Low-stock threshold"
        onChange={(event) => setDraft(event.target.value)}
      />
      {dirty ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setThresholdAction({
                variantId,
                locationId,
                threshold: draft.trim(),
              });
              if (result.status === "error") setError(result.message);
              else {
                setError(null);
                router.refresh();
              }
            })
          }
        >
          Save
        </Button>
      ) : null}
      {error === null ? null : <FieldHint tone="error">{error}</FieldHint>}
    </div>
  );
}
