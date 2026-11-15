"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SettingView } from "@/modules/settings/settings-admin.service";
import { resetSettingAction, saveSettingsAction } from "@/modules/settings/settings.actions";

type Values = Record<string, string | string[]>;

function initial(settings: readonly SettingView[]): Values {
  return Object.fromEntries(
    settings.map((setting) => [
      setting.key,
      setting.kind === "multi" ? setting.selected : setting.value,
    ]),
  );
}

/** One group of settings: an input per kind, save, and back-to-default per setting. */
export function SettingsForm({
  group,
  title,
  settings,
}: {
  group: string;
  title: string;
  settings: readonly SettingView[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => initial(settings));
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
    field?: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const startValues = initial(settings);
  const changed = settings
    .filter((setting) => setting.editable)
    .filter(
      (setting) => JSON.stringify(values[setting.key]) !== JSON.stringify(startValues[setting.key]),
    );

  const set = (key: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      const result = await saveSettingsAction(
        group,
        Object.fromEntries(changed.map((setting) => [setting.key, values[setting.key]])),
      );
      if (result.status === "success") {
        setMessage({ tone: "success", text: result.message });
        router.refresh();
      } else if (result.status === "error") {
        setMessage({
          tone: "error",
          text: result.message,
          ...(result.field === undefined ? {} : { field: result.field }),
        });
      }
    });

  return (
    <section
      className="rounded-lg border border-border bg-background"
      aria-labelledby="group-title"
      data-testid="settings-form"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 id="group-title" className="text-base font-semibold">
          {title}
        </h2>
        <Button
          type="button"
          onClick={save}
          disabled={pending || changed.length === 0}
          data-testid="save-settings"
        >
          Save {changed.length === 0 ? "" : `(${changed.length})`}
        </Button>
      </header>
      {message === null ? null : (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "mx-5 mt-4 rounded-md px-3 py-2 text-sm",
            message.tone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
          )}
          data-testid="settings-message"
        >
          {message.text}
        </p>
      )}
      <ul className="divide-y divide-border">
        {settings.map((setting) => {
          const id = `setting-${setting.key}`;
          const value = values[setting.key];
          const disabled = !setting.editable || pending;
          const error = message?.tone === "error" && message.field === setting.key;
          return (
            <li
              key={setting.key}
              className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_18rem]"
              data-testid={id}
            >
              <div>
                <label htmlFor={id} className="text-sm font-medium">
                  {setting.label.en}
                </label>
                <p lang="bn" className="text-xs text-muted-foreground">
                  {setting.label.bn}
                </p>
                {setting.help.en === "" ? null : (
                  <p className="mt-1 text-xs text-muted-foreground">{setting.help.en}</p>
                )}
                {setting.help.bn === "" ? null : (
                  <p lang="bn" className="text-xs text-muted-foreground">
                    {setting.help.bn}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Default:{" "}
                  <code>
                    {setting.kind === "multi"
                      ? setting.defaultValue
                      : setting.defaultValue || "(empty)"}
                  </code>
                  {setting.updatedBy === null ? "" : ` · last changed by ${setting.updatedBy}`}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {setting.editedAt !== null ? (
                  <p className="text-sm">
                    <span className="font-medium">{setting.value}</span> ·{" "}
                    <Link href={setting.editedAt.href} className="underline underline-offset-4">
                      edit in {setting.editedAt.label}
                    </Link>
                  </p>
                ) : setting.kind === "bool" ? (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      className="size-4"
                      disabled={disabled}
                      checked={value === "true"}
                      onChange={(event) =>
                        set(setting.key, event.target.checked ? "true" : "false")
                      }
                    />
                    {value === "true" ? "On" : "Off"}
                  </label>
                ) : setting.kind === "enum" ? (
                  <Select
                    id={id}
                    disabled={disabled}
                    value={String(value)}
                    onChange={(event) => set(setting.key, event.target.value)}
                  >
                    {setting.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : setting.kind === "multi" ? (
                  <fieldset className="flex flex-col gap-1" aria-labelledby={id}>
                    {setting.options.map((option) => {
                      const chosen = Array.isArray(value) && value.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className="inline-flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="size-4"
                            disabled={disabled}
                            checked={chosen}
                            onChange={(event) => {
                              const list = Array.isArray(value) ? value : [];
                              set(
                                setting.key,
                                event.target.checked
                                  ? [...list, option.value]
                                  : list.filter((item) => item !== option.value),
                              );
                            }}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </fieldset>
                ) : setting.kind === "textarea" || setting.kind === "json" ? (
                  <Textarea
                    id={id}
                    rows={setting.kind === "json" ? 4 : 3}
                    disabled={disabled}
                    className={cn(setting.kind === "json" && "font-mono text-xs")}
                    value={String(value)}
                    aria-invalid={error}
                    onChange={(event) => set(setting.key, event.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {setting.kind === "money" ? (
                      <span className="text-sm text-muted-foreground">৳</span>
                    ) : null}
                    <Input
                      id={id}
                      disabled={disabled}
                      inputMode={setting.kind === "text" ? "text" : "decimal"}
                      value={String(value)}
                      aria-invalid={error}
                      onChange={(event) => set(setting.key, event.target.value)}
                    />
                    {setting.unit === null ? null : (
                      <span className="text-xs text-muted-foreground">{setting.unit}</span>
                    )}
                  </div>
                )}
                {setting.editable && !setting.isDefault ? (
                  <button
                    type="button"
                    className="self-start text-xs underline underline-offset-4"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await resetSettingAction(setting.key);
                        if (result.status !== "idle") {
                          setMessage({ tone: result.status, text: result.message });
                        }
                        router.refresh();
                        if (result.status === "success") {
                          set(
                            setting.key,
                            setting.kind === "multi"
                              ? setting.defaultValue.split(",")
                              : setting.defaultValue,
                          );
                        }
                      })
                    }
                  >
                    Back to default
                  </button>
                ) : null}
                {!setting.editable && setting.editedAt === null ? (
                  <p className="text-xs text-muted-foreground">
                    Your role can see this but not change it.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
