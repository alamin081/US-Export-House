"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveOptionPresetAction } from "@/modules/catalog/catalog.actions";
import { ErrorSummary, TextField } from "../catalogue/fields";

export interface PresetInitial {
  id: string;
  type: "SIZE" | "COLOUR";
  group: string;
  code: string;
  valueEn: string;
  valueBn: string | null;
  hex: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Create or edit one size or colour in the option library. */
export function PresetEditor({ initial }: { initial: PresetInitial | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState({
    type: initial?.type ?? ("COLOUR" as "SIZE" | "COLOUR"),
    group: initial?.group ?? "colour",
    code: initial?.code ?? "",
    valueEn: initial?.valueEn ?? "",
    valueBn: initial?.valueBn ?? "",
    hex: initial?.hex ?? "",
    sortOrder: String(initial?.sortOrder ?? 0),
    isActive: initial?.isActive ?? true,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = <K extends keyof typeof state>(key: K, value: (typeof state)[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const result = await saveOptionPresetAction({
        ...(initial === null ? {} : { id: initial.id }),
        ...state,
        sortOrder: Number(state.sortOrder) || 0,
      });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      setFieldErrors({});
      setMessage(null);
      router.push("/admin/options");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold">
        {initial === null ? "Add an option value" : `Edit ${initial.valueEn}`}
      </h2>
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="preset-type">Type</Label>
          <Select
            id="preset-type"
            value={state.type}
            onChange={(event) => set("type", event.target.value as "SIZE" | "COLOUR")}
          >
            <option value="COLOUR">Colour</option>
            <option value="SIZE">Size</option>
          </Select>
        </div>
        <TextField
          label="Group"
          value={state.group}
          error={fieldErrors.group}
          hint="e.g. apparel, collar, waist, panjabi, colour"
          onChange={(value) => set("group", value)}
        />
        <TextField
          label="SKU code"
          value={state.code}
          error={fieldErrors.code}
          hint="e.g. NVY, XL, 155"
          onChange={(value) => set("code", value.toUpperCase())}
        />
        <TextField
          label="Order"
          inputMode="numeric"
          value={state.sortOrder}
          onChange={(value) => set("sortOrder", value.replace(/[^0-9]/g, ""))}
        />
        <TextField
          label="Value (English)"
          required
          value={state.valueEn}
          error={fieldErrors.valueEn}
          onChange={(value) => set("valueEn", value)}
        />
        <TextField
          label="Value (Bengali)"
          lang="bn"
          value={state.valueBn}
          error={fieldErrors.valueBn}
          onChange={(value) => set("valueBn", value)}
        />
        {state.type === "COLOUR" ? (
          <TextField
            label="Swatch (hex)"
            value={state.hex}
            error={fieldErrors.hex}
            placeholder="#1F2A44"
            onChange={(value) => set("hex", value)}
          />
        ) : (
          <span />
        )}
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <Checkbox
            checked={state.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
          Offered in the matrix
        </label>
      </div>
      <div>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
