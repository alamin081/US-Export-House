"use client";

import { createContext, useContext, useId, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ContentImage, ContentLink, Localized } from "@/modules/content/content.schema";
import { PLACEHOLDER_HELP, PLACEHOLDERS } from "@/modules/content/placeholders";
import { ACCEPT_ATTRIBUTE, uploadImage } from "../../catalogue/upload-image";

/**
 * Shared pieces of the content editors. The admin is in English; every field
 * carries a short Bengali hint so staff who read either language can use it.
 */

export interface LinkTargets {
  categories: Array<{ id: string; name: string; parentId: string | null }>;
  tags: Array<{ slug: string; name: string }>;
  pages: Array<{ key: string; slug: string; title: string; published: boolean }>;
}

export const EditorContext = createContext<{ targets: LinkTargets; mockStorage: boolean }>({
  targets: { categories: [], tags: [], pages: [] },
  mockStorage: false,
});

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export const EMPTY: Localized = { en: "", bn: "" };

// ---------------------------------------------------------------------------
// layout helpers
// ---------------------------------------------------------------------------

export function Hint({ en, bn }: { en?: string; bn?: string }) {
  if (en === undefined && bn === undefined) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {en}
      {bn === undefined ? null : (
        <span lang="bn" className="block">
          {bn}
        </span>
      )}
    </p>
  );
}

export function Panel({
  title,
  children,
  actions,
  className,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-background", className)}
      data-testid={testId}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions}
      </header>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

/** Up, down, copy and remove buttons for one item of a list. */
export function ItemTools({
  index,
  count,
  onMove,
  onRemove,
  onCopy,
  label,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  onCopy?: () => void;
  label: string;
}) {
  const button =
    "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={button}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`Move ${label} up`}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={button}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`Move ${label} down`}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
      {onCopy === undefined ? null : (
        <button type="button" className={button} onClick={onCopy} aria-label={`Copy ${label}`}>
          <Copy className="size-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={cn(button, "hover:text-destructive")}
        onClick={() => {
          if (window.confirm(`Remove this ${label}?`)) onRemove();
        }}
        aria-label={`Remove ${label}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, at) => (at === index ? value : item));
}

/** Gives copied items (and everything inside them) fresh ids. */
export function withNewIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key, inner) =>
    key === "id" && typeof inner === "string" ? newId() : inner,
  ) as T;
}

// ---------------------------------------------------------------------------
// bilingual text
// ---------------------------------------------------------------------------

function PlaceholderMenu({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <select
      className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-muted-foreground"
      value=""
      aria-label="Insert a number from settings"
      onChange={(event) => {
        if (event.target.value !== "") onInsert(`{${event.target.value}}`);
      }}
    >
      <option value="">Insert setting…</option>
      {PLACEHOLDERS.map((name) => (
        <option key={name} value={name}>
          {PLACEHOLDER_HELP[name]}
        </option>
      ))}
    </select>
  );
}

export function LocalizedField({
  label,
  value,
  onChange,
  required,
  multiline,
  rows = 3,
  hintEn,
  hintBn,
  maxLength,
  placeholders = false,
  testId,
}: {
  label: string;
  value: Localized;
  onChange: (value: Localized) => void;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hintEn?: string;
  hintBn?: string;
  maxLength?: number;
  placeholders?: boolean;
  testId?: string;
}) {
  const id = useId();
  const missingBn = value.en.trim() !== "" && value.bn.trim() === "";
  const field = (lang: "en" | "bn") => {
    const common = {
      id: `${id}-${lang}`,
      lang,
      value: value[lang],
      maxLength,
      "data-testid": testId === undefined ? undefined : `${testId}-${lang}`,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ ...value, [lang]: event.target.value }),
    };
    return multiline ? <Textarea rows={rows} {...common} /> : <Input {...common} />;
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span>
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </span>
        {placeholders ? (
          <PlaceholderMenu
            onInsert={(token) => onChange({ ...value, en: `${value.en}${token}` })}
          />
        ) : null}
      </legend>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-en`} className="mb-1 block text-xs text-muted-foreground">
            English{required ? " (required)" : ""}
          </label>
          {field("en")}
        </div>
        <div>
          <label htmlFor={`${id}-bn`} className="mb-1 block text-xs text-muted-foreground">
            বাংলা (Bengali)
          </label>
          {field("bn")}
          {missingBn ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              No Bengali yet — English will show. বাংলা অনুবাদ নেই।
            </p>
          ) : null}
        </div>
      </div>
      <Hint
        {...(hintEn === undefined ? {} : { en: hintEn })}
        {...(hintBn === undefined ? {} : { bn: hintBn })}
      />
    </fieldset>
  );
}

export const FORMATTING_HINT = {
  en: "**bold** · *italic* · [link text](https://… or /page). No HTML.",
  bn: "মোটা লেখা: **লেখা** · লিংক: [লেখা](ঠিকানা)",
};

// ---------------------------------------------------------------------------
// small inputs
// ---------------------------------------------------------------------------

export function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  hintEn,
  hintBn,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hintEn?: string;
  hintBn?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Hint
        {...(hintEn === undefined ? {} : { en: hintEn })}
        {...(hintBn === undefined ? {} : { bn: hintBn })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// schedule (Bangladesh time)
// ---------------------------------------------------------------------------

const DHAKA_MS = 6 * 60 * 60 * 1000;

function toInput(iso: string | null): string {
  if (iso === null) return "";
  const at = Date.parse(iso);
  return Number.isNaN(at) ? "" : new Date(at + DHAKA_MS).toISOString().slice(0, 16);
}

function fromInput(value: string): string | null {
  if (value === "") return null;
  const at = Date.parse(`${value}:00+06:00`);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

export function ScheduleField({
  value,
  onChange,
}: {
  value: { startsAt: string | null; endsAt: string | null };
  onChange: (value: { startsAt: string | null; endsAt: string | null }) => void;
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Show only between (optional)</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-from`} className="mb-1 block text-xs text-muted-foreground">
            From
          </label>
          <Input
            id={`${id}-from`}
            type="datetime-local"
            value={toInput(value.startsAt)}
            onChange={(event) => onChange({ ...value, startsAt: fromInput(event.target.value) })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="mb-1 block text-xs text-muted-foreground">
            Until
          </label>
          <Input
            id={`${id}-to`}
            type="datetime-local"
            value={toInput(value.endsAt)}
            onChange={(event) => onChange({ ...value, endsAt: fromInput(event.target.value) })}
          />
        </div>
      </div>
      <Hint
        en="Bangladesh time. Leave empty to always show. Switches on and off within 5 minutes."
        bn="ঈদ বা পহেলা বৈশাখের মতো ক্যাম্পেইনের জন্য শুরু ও শেষের সময় দিন।"
      />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// links
// ---------------------------------------------------------------------------

export function linkLabel(link: ContentLink | null, targets: LinkTargets): string {
  if (link === null) return "—";
  switch (link.type) {
    case "category":
      return `Category: ${targets.categories.find((row) => row.id === link.id)?.name ?? "missing"}`;
    case "page":
      return `Page: ${targets.pages.find((row) => row.key === link.key)?.title ?? link.key}`;
    case "tag":
      return `Collection: ${targets.tags.find((row) => row.slug === link.slug)?.name ?? link.slug}`;
    case "product":
      return "Product";
    case "url":
      return link.href;
  }
}

export function LinkPicker({
  label,
  value,
  onChange,
  allowNone = false,
  testId,
}: {
  label: string;
  value: ContentLink | null;
  onChange: (value: ContentLink | null) => void;
  allowNone?: boolean;
  testId?: string;
}) {
  const { targets } = useContext(EditorContext);
  const id = useId();
  const type = value?.type ?? "none";
  const [url, setUrl] = useState(value?.type === "url" ? value.href : "");
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
        <Select
          id={id}
          aria-label={`${label}: kind of link`}
          value={type}
          data-testid={testId === undefined ? undefined : `${testId}-type`}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "none") onChange(null);
            else if (next === "category" && targets.categories[0] !== undefined)
              onChange({ type: "category", id: targets.categories[0].id });
            else if (next === "page" && targets.pages[0] !== undefined)
              onChange({ type: "page", key: targets.pages[0].key });
            else if (next === "tag" && targets.tags[0] !== undefined)
              onChange({ type: "tag", slug: targets.tags[0].slug });
            else if (next === "url") onChange({ type: "url", href: url || "/shop" });
          }}
        >
          {allowNone ? <option value="none">No link</option> : null}
          <option value="category">Category</option>
          <option value="page">Page</option>
          <option value="tag">Collection (tag)</option>
          <option value="url">Web address</option>
          {value?.type === "product" ? <option value="product">Product</option> : null}
        </Select>
        {value?.type === "category" ? (
          <Select
            aria-label={`${label}: category`}
            value={value.id}
            onChange={(event) => onChange({ type: "category", id: event.target.value })}
          >
            {targets.categories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.parentId === null ? "" : "— "}
                {row.name}
              </option>
            ))}
          </Select>
        ) : value?.type === "page" ? (
          <Select
            aria-label={`${label}: page`}
            value={value.key}
            onChange={(event) => onChange({ type: "page", key: event.target.value })}
          >
            {targets.pages.map((row) => (
              <option key={row.key} value={row.key}>
                {row.title}
                {row.published ? "" : " (not published)"}
              </option>
            ))}
          </Select>
        ) : value?.type === "tag" ? (
          <Select
            aria-label={`${label}: collection`}
            value={value.slug}
            onChange={(event) => onChange({ type: "tag", slug: event.target.value })}
          >
            {targets.tags.map((row) => (
              <option key={row.slug} value={row.slug}>
                {row.name}
              </option>
            ))}
          </Select>
        ) : value?.type === "url" ? (
          <Input
            aria-label={`${label}: address`}
            value={url}
            placeholder="https://… or /shop"
            data-testid={testId === undefined ? undefined : `${testId}-url`}
            onChange={(event) => {
              setUrl(event.target.value);
              onChange({ type: "url", href: event.target.value });
            }}
          />
        ) : (
          <span className="self-center text-xs text-muted-foreground">
            {linkLabel(value, targets)}
          </span>
        )}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------

export function ImageField({
  label,
  value,
  onChange,
  sizeHint,
  minWidth,
  required = false,
  testId,
}: {
  label: string;
  value: ContentImage | null;
  onChange: (value: ContentImage | null) => void;
  sizeHint: string;
  minWidth?: number;
  required?: boolean;
  testId?: string;
}) {
  const { mockStorage } = useContext(EditorContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const small =
    value !== null && minWidth !== undefined && value.width !== null && value.width < minWidth;
  return (
    <fieldset className="flex flex-col gap-2" data-testid={testId}>
      <legend className="mb-1 text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </legend>
      <div className="flex flex-wrap items-start gap-4">
        <div className="aspect-video w-40 overflow-hidden rounded-md bg-secondary">
          {value === null ? null : (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={value.url} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-secondary">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-3.5" />
            )}
            {value === null ? "Upload" : "Replace"}
            <input
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              data-testid={testId === undefined ? undefined : `${testId}-file`}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file === undefined) return;
                setBusy(true);
                setError(null);
                try {
                  const uploaded = await uploadImage(file);
                  onChange({
                    url: uploaded.url,
                    key: uploaded.key,
                    width: uploaded.width,
                    height: uploaded.height,
                    alt: value?.alt ?? EMPTY,
                  });
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : "Upload failed.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {value === null || required ? null : (
            <button type="button" className="text-xs underline" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
          {mockStorage ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] text-amber-900">
              Test storage
            </span>
          ) : null}
        </div>
      </div>
      <Hint en={sizeHint} bn="JPG, PNG বা WebP; বড় ছবি নিজে থেকে ছোট হয়ে যাবে।" />
      {small ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This image is {value?.width}px wide; at least {minWidth}px looks sharp.
        </p>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {value === null ? null : (
        <LocalizedField
          label="Image description (alt text)"
          value={value.alt}
          onChange={(alt) => onChange({ ...value, alt })}
          required
          hintEn="What the picture shows, for blind visitors and search engines."
          hintBn="ছবিতে কী আছে, সংক্ষেপে লিখুন।"
          maxLength={200}
          {...(testId === undefined ? {} : { testId: `${testId}-alt` })}
        />
      )}
    </fieldset>
  );
}
