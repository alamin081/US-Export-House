"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActionResult } from "@/modules/access/action-state";
import { saveCheckoutSettingsAction } from "@/modules/checkout-admin/checkout-admin.actions";
import { TextField } from "../catalogue/fields";

export interface SettingRow {
  field: string;
  label: string;
  kind: "text" | "boolean";
  value: string;
}

export function CheckoutSettingsForm({
  groups,
  save = saveCheckoutSettingsAction,
  testId = "checkout-settings-form",
  submitLabel = "Save settings",
}: {
  groups: ReadonlyArray<{ title: string; rows: readonly SettingRow[] }>;
  /** The Server Action that saves the changed values. */
  save?: (values: Record<string, string>) => Promise<ActionResult>;
  testId?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(groups.flatMap((group) => group.rows.map((row) => [row.field, row.value]))),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string; field?: string } | null>(
    null,
  );
  const set = (field: string, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="mt-6 flex flex-col gap-8"
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await save(values);
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
      {groups.map((group) => (
        <fieldset key={group.title} className="rounded-lg border border-border bg-background p-4">
          <legend className="px-1 text-sm font-semibold">{group.title}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {group.rows.map((row) =>
              row.kind === "boolean" ? (
                <label key={row.field} className="flex items-center gap-2 self-end text-sm">
                  <Checkbox
                    checked={values[row.field] === "true"}
                    onChange={(event) => set(row.field, String(event.target.checked))}
                  />
                  {row.label}
                </label>
              ) : (
                <TextField
                  key={row.field}
                  label={row.label}
                  value={values[row.field] ?? ""}
                  onChange={(next) => set(row.field, next)}
                  error={
                    message?.ok === false && message.field === row.field ? message.text : undefined
                  }
                />
              ),
            )}
          </div>
        </fieldset>
      ))}
      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        <Save aria-hidden="true" />
        {submitLabel}
      </Button>
    </form>
  );
}
