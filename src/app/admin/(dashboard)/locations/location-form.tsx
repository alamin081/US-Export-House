"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { deleteLocationAction, saveLocationAction } from "@/modules/inventory/inventory.actions";
import { TextField } from "../catalogue/fields";

export interface LocationFormValue {
  id?: string;
  code: string;
  type: "BRANCH" | "WAREHOUSE";
  nameEn: string;
  nameBn: string;
  division: string;
  district: string;
  thana: string;
  addressEn: string;
  addressBn: string;
  phone: string;
  hoursEn: string;
  hoursBn: string;
  sortOrder: string;
  isActive: boolean;
  isOnlineFulfillment: boolean;
  isDefaultOnlineFulfillment: boolean;
}

export const EMPTY_LOCATION: LocationFormValue = {
  code: "",
  type: "BRANCH",
  nameEn: "",
  nameBn: "",
  division: "",
  district: "",
  thana: "",
  addressEn: "",
  addressBn: "",
  phone: "",
  hoursEn: "",
  hoursBn: "",
  sortOrder: "0",
  isActive: true,
  isOnlineFulfillment: false,
  isDefaultOnlineFulfillment: false,
};

/** Create or edit a branch / warehouse. */
export function LocationForm({
  initial,
  divisions,
  canDelete,
  wasDefault,
}: {
  initial: LocationFormValue;
  divisions: readonly string[];
  canDelete: boolean;
  wasDefault: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string; field?: string } | null>(
    null,
  );
  const [confirmDeactivate, setConfirmDeactivate] = useState<boolean | null>(null);

  const set = <K extends keyof LocationFormValue>(key: K, next: LocationFormValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const errorFor = (field: string) =>
    message?.ok === false && message.field === field ? message.text : undefined;

  const save = () =>
    startTransition(async () => {
      const result = await saveLocationAction({
        ...value,
        confirmDeactivate: confirmDeactivate === true,
      });
      if (result.status === "error") {
        setMessage({
          ok: false,
          text: result.message,
          ...(result.field === undefined ? {} : { field: result.field }),
        });
        if (result.needsConfirmation === true) setConfirmDeactivate(false);
        return;
      }
      setMessage({ ok: true, text: result.message });
      if (value.id === undefined) router.push(`/admin/locations/${result.data.id}`);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (value.id === undefined) return;
      if (!window.confirm(`Delete ${value.code}? This cannot be undone.`)) return;
      const result = await deleteLocationAction(value.id);
      if (result.status === "error") {
        setMessage({ ok: false, text: result.message });
        return;
      }
      router.push("/admin/locations");
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-6 rounded-lg border border-border bg-background p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
          data-testid="location-form-message"
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Code"
          required
          name="code"
          value={value.code}
          error={errorFor("code")}
          hint="Capital letters and digits, e.g. WH-01 or BR-02."
          onChange={(next) => set("code", next.toUpperCase())}
        />
        <div>
          <Label htmlFor="location-type" required>
            Type
          </Label>
          <Select
            id="location-type"
            name="type"
            value={value.type}
            onChange={(event) => set("type", event.target.value as LocationFormValue["type"])}
          >
            <option value="BRANCH">Branch (showroom)</option>
            <option value="WAREHOUSE">Warehouse</option>
          </Select>
        </div>
        <TextField
          label="Sort order"
          name="sortOrder"
          inputMode="numeric"
          value={value.sortOrder}
          onChange={(next) => set("sortOrder", next)}
        />
        <TextField
          label="Name (English)"
          required
          name="nameEn"
          value={value.nameEn}
          error={errorFor("nameEn")}
          onChange={(next) => set("nameEn", next)}
        />
        <TextField
          label="Name (Bengali)"
          lang="bn"
          name="nameBn"
          value={value.nameBn}
          onChange={(next) => set("nameBn", next)}
        />
        <TextField
          label="Phone"
          name="phone"
          inputMode="tel"
          value={value.phone}
          error={errorFor("phone")}
          onChange={(next) => set("phone", next)}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Address</legend>
        <div>
          <Label htmlFor="location-division">Division</Label>
          <Select
            id="location-division"
            value={value.division}
            onChange={(event) => set("division", event.target.value)}
          >
            <option value="">—</option>
            {divisions.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </Select>
        </div>
        <TextField
          label="District"
          value={value.district}
          onChange={(next) => set("district", next)}
        />
        <TextField
          label="Thana / upazila"
          value={value.thana}
          onChange={(next) => set("thana", next)}
        />
        <TextField
          label="Street address (English)"
          className="sm:col-span-3"
          value={value.addressEn}
          onChange={(next) => set("addressEn", next)}
        />
        <TextField
          label="Street address (Bengali)"
          lang="bn"
          className="sm:col-span-3"
          value={value.addressBn}
          onChange={(next) => set("addressBn", next)}
        />
        <TextField
          label="Opening hours (English)"
          value={value.hoursEn}
          onChange={(next) => set("hoursEn", next)}
        />
        <TextField
          label="Opening hours (Bengali)"
          lang="bn"
          value={value.hoursBn}
          onChange={(next) => set("hoursBn", next)}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Status and online orders</legend>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            name="isActive"
            checked={value.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            name="isOnlineFulfillment"
            checked={value.isOnlineFulfillment}
            onChange={(event) => set("isOnlineFulfillment", event.target.checked)}
          />
          Fulfils online orders (its stock counts as online stock)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            name="isDefaultOnlineFulfillment"
            checked={value.isDefaultOnlineFulfillment}
            disabled={wasDefault}
            onChange={(event) => set("isDefaultOnlineFulfillment", event.target.checked)}
          />
          Default location for online orders
        </label>
        <FieldHint>
          {wasDefault
            ? "This is the default online location. To change it, make another location the default."
            : "Exactly one location is the default; choosing this one replaces the current default."}
        </FieldHint>
        {errorFor("isDefaultOnlineFulfillment") === undefined ? null : (
          <FieldHint tone="error">{errorFor("isDefaultOnlineFulfillment")}</FieldHint>
        )}
        {confirmDeactivate === null ? null : (
          <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <Checkbox
              checked={confirmDeactivate}
              onChange={(event) => setConfirmDeactivate(event.target.checked)}
              data-testid="confirm-deactivate"
            />
            I understand this location still holds stock and want to deactivate it anyway.
          </label>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending} data-testid="save-location">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save location
        </Button>
        {canDelete ? (
          <Button type="button" variant="outline" disabled={pending} onClick={remove}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
