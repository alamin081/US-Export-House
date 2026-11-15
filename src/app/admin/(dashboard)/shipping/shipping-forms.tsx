"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  mapAreaAction,
  saveCheckoutSettingsAction,
  saveZoneAction,
  searchAreasAction,
} from "@/modules/checkout-admin/checkout-admin.actions";
import { TextField } from "../catalogue/fields";

interface ZoneValue {
  id: string;
  code: string;
  nameEn: string;
  nameBn: string;
  rate: string;
  freeThreshold: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: string;
  areas: number;
}

type Message = { ok: boolean; text: string; field?: string } | null;

function Feedback({ message }: { message: Message }) {
  if (message === null) return null;
  return (
    <p
      role={message.ok ? "status" : "alert"}
      className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
    >
      {message.text}
    </p>
  );
}

export function ZoneEditor({ zone }: { zone: ZoneValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(zone);
  const [message, setMessage] = useState<Message>(null);
  const set = <K extends keyof ZoneValue>(key: K, next: ZoneValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const errorFor = (field: string) =>
    message?.ok === false && message.field === field ? message.text : undefined;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      data-testid={`zone-${zone.code}`}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveZoneAction(zone.id, value);
          if (result.status === "success") {
            setMessage({ ok: true, text: result.message });
            router.refresh();
          } else if (result.status === "error") {
            setMessage({
              ok: false,
              text: result.message,
              ...(result.field === undefined ? {} : { field: result.field }),
            });
          }
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{zone.code}</span>
        <span className="flex gap-1">
          {zone.isDefault ? <Badge variant="success">Fallback</Badge> : null}
          <Badge variant="outline">{zone.areas} mapped</Badge>
        </span>
      </div>
      <TextField
        label="Name (English)"
        value={value.nameEn}
        onChange={(next) => set("nameEn", next)}
        error={errorFor("nameEn")}
      />
      <TextField
        label="Name (Bengali)"
        lang="bn"
        value={value.nameBn}
        onChange={(next) => set("nameBn", next)}
      />
      <TextField
        label="Rate (taka)"
        inputMode="decimal"
        value={value.rate}
        onChange={(next) => set("rate", next)}
        error={errorFor("rate")}
      />
      <TextField
        label="Free from (taka, optional)"
        inputMode="decimal"
        value={value.freeThreshold}
        onChange={(next) => set("freeThreshold", next)}
        error={errorFor("freeThreshold")}
        hint="Empty: the shop-wide threshold below."
      />
      <TextField
        label="Order"
        inputMode="numeric"
        value={value.sortOrder}
        onChange={(next) => set("sortOrder", next)}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.isActive}
          onChange={(event) => set("isActive", event.target.checked)}
        />
        Active
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.isDefault}
          onChange={(event) => set("isDefault", event.target.checked)}
        />
        Fallback for unmapped areas
      </label>
      {errorFor("isDefault") === undefined ? null : (
        <FieldHint tone="error">{errorFor("isDefault")}</FieldHint>
      )}
      <Feedback message={message?.field === undefined ? message : null} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Save aria-hidden="true" />
        )}
        Save zone
      </Button>
    </form>
  );
}

export function ThresholdForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<Message>(null);

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCheckoutSettingsAction({ freeShippingThresholdPoisha: value });
          if (result.status === "success") {
            setMessage({ ok: true, text: result.message });
            router.refresh();
          } else if (result.status === "error") {
            setMessage({ ok: false, text: result.message });
          }
        });
      }}
    >
      <TextField
        className="w-56"
        label="Free delivery from (taka)"
        inputMode="decimal"
        value={value}
        onChange={setValue}
        hint="Measured after the coupon discount."
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Save aria-hidden="true" />
        Save
      </Button>
      <Feedback message={message} />
    </form>
  );
}

type SearchResult = Awaited<ReturnType<typeof searchAreasAction>>;

export function AreaMapper({
  zones,
}: {
  zones: ReadonlyArray<{ id: string; nameEn: string; isDefault: boolean }>;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const zoneName = (id: string | null | undefined) =>
    id == null ? null : (zones.find((zone) => zone.id === id)?.nameEn ?? "?");
  const fallback = zones.find((zone) => zone.isDefault)?.nameEn ?? "—";

  const search = (text: string) =>
    startTransition(async () => {
      setResult(await searchAreasAction(text));
    });

  const map = (level: "district" | "upazila", areaId: string, zoneId: string) =>
    startTransition(async () => {
      const saved = await mapAreaAction({ level, areaId, zoneId });
      setMessage(
        saved.status === "success"
          ? { ok: true, text: saved.message }
          : { ok: false, text: saved.status === "error" ? saved.message : "" },
      );
      setResult(await searchAreasAction(query));
    });

  const zoneSelect = (level: "district" | "upazila", areaId: string, current: string | null) => (
    <Select
      aria-label="Zone"
      className="h-9 w-48"
      value={current ?? ""}
      disabled={pending}
      onChange={(event) => map(level, areaId, event.target.value)}
    >
      <option value="">
        {level === "district"
          ? `Not set (fallback: ${fallback})`
          : "Not set (follows the district)"}
      </option>
      {zones.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.nameEn}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="mt-3">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <Input
          aria-label="Search areas"
          placeholder="e.g. Savar, সাভার, Gazipur"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={pending || query.trim().length < 2}>
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>
      <div className="mt-2">
        <Feedback message={message} />
      </div>

      {result === null ? null : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[40rem] text-sm" data-testid="area-results">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Area</th>
                <th className="px-4 py-2.5 font-medium">Charged as</th>
                <th className="px-4 py-2.5 font-medium">Own zone</th>
              </tr>
            </thead>
            <tbody>
              {result.districts.length + result.upazilas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    Nothing found.
                  </td>
                </tr>
              ) : null}
              {result.districts.map((district) => (
                <tr key={district.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{district.nameEn}</span>{" "}
                    <span lang="bn" className="text-muted-foreground">
                      {district.nameBn}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      District · {district.division.nameEn}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{zoneName(district.zoneArea?.zoneId) ?? fallback}</td>
                  <td className="px-4 py-2.5">
                    {zoneSelect("district", district.id, district.zoneArea?.zoneId ?? null)}
                  </td>
                </tr>
              ))}
              {result.upazilas.map((upazila) => (
                <tr key={upazila.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{upazila.nameEn}</span>{" "}
                    <span lang="bn" className="text-muted-foreground">
                      {upazila.nameBn}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {upazila.kind === "METRO_THANA" ? "Thana" : "Upazila"} ·{" "}
                      {upazila.district.nameEn}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {zoneName(upazila.zoneArea?.zoneId) ??
                      zoneName(upazila.district.zoneArea?.zoneId) ??
                      fallback}
                  </td>
                  <td className="px-4 py-2.5">
                    {zoneSelect("upazila", upazila.id, upazila.zoneArea?.zoneId ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
