"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveLabelAction } from "@/modules/content/content.actions";

interface LabelSide {
  original: string;
  override: string | null;
  updatedBy: string | null;
}

interface LabelRow {
  key: string;
  where: string;
  placeholders: string[];
  en: LabelSide;
  bn: LabelSide;
}

function LabelCell({
  labelKey,
  locale,
  side,
  canSave,
}: {
  labelKey: string;
  locale: "en" | "bn";
  side: LabelSide;
  canSave: boolean;
}) {
  const [value, setValue] = useState(side.override ?? "");
  // What is live now, so the button settles after a save without a reload.
  const [saved, setSaved] = useState(side.override ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = value.trim() !== saved;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground" lang={locale}>
        Original: {side.original}
      </p>
      <div className="flex gap-2">
        <Input
          lang={locale}
          value={value}
          placeholder="(original)"
          disabled={!canSave || pending}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage(null);
          }}
          data-testid={`label-${labelKey}-${locale}`}
        />
        {canSave ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || pending}
            data-testid={`save-label-${labelKey}-${locale}`}
            onClick={() =>
              start(async () => {
                const result = await saveLabelAction({ key: labelKey, locale, value });
                if (result.status === "success") {
                  const live = value.trim() === side.original ? "" : value.trim();
                  setSaved(live);
                  setValue(live);
                }
                if (result.status === "success" || result.status === "error") {
                  setMessage({ tone: result.status, text: result.message });
                }
              })
            }
          >
            Save
          </Button>
        ) : null}
      </div>
      {side.updatedBy === null ? null : (
        <p className="text-xs text-muted-foreground">Changed by {side.updatedBy}</p>
      )}
      {message === null ? null : (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "text-xs",
            message.tone === "error" ? "text-destructive" : "text-emerald-700",
          )}
          data-testid={`label-message-${labelKey}-${locale}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Search, filter to changed labels, and edit English and Bengali side by side. */
export function LabelsEditor({
  labels,
  canSave,
}: {
  labels: readonly LabelRow[];
  canSave: boolean;
}) {
  const [term, setTerm] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return labels.filter((label) => {
      if (onlyChanged && label.en.override === null && label.bn.override === null) return false;
      if (needle === "") return true;
      return [
        label.key,
        label.where,
        label.en.original,
        label.bn.original,
        label.en.override ?? "",
        label.bn.override ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [labels, term, onlyChanged]);

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          placeholder="Search labels"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search labels"
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyChanged}
            onChange={(event) => setOnlyChanged(event.target.checked)}
          />
          Changed only
        </label>
        <span className="text-xs text-muted-foreground">{shown.length} labels</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-background">
        {shown.map((label) => (
          <li key={label.key} className="grid gap-3 p-4 lg:grid-cols-[16rem_1fr_1fr]">
            <div>
              <code className="text-xs">{label.key}</code>
              <p className="mt-1 text-xs text-muted-foreground">{label.where}</p>
              {label.placeholders.length === 0 ? null : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep: {label.placeholders.map((name) => `{${name}}`).join(" ")}
                </p>
              )}
            </div>
            <LabelCell labelKey={label.key} locale="en" side={label.en} canSave={canSave} />
            <LabelCell labelKey={label.key} locale="bn" side={label.bn} canSave={canSave} />
          </li>
        ))}
      </ul>
    </div>
  );
}
