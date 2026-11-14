"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Labelled admin form fields with the server's validation message shown right
 * under the field (wired with aria-invalid and aria-describedby).
 */

interface BaseProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  className?: string;
  name?: string;
  lang?: "en" | "bn";
  maxLength?: number;
}

function describedBy(id: string, error: string | undefined, hint: string | undefined) {
  if (error !== undefined) return `${id}-error`;
  if (hint !== undefined) return `${id}-hint`;
  return undefined;
}

function Message({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  if (error !== undefined) {
    return (
      <FieldHint id={`${id}-error`} tone="error" role="alert">
        {error}
      </FieldHint>
    );
  }
  if (hint !== undefined) return <FieldHint id={`${id}-hint`}>{hint}</FieldHint>;
  return null;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  ...rest
}: BaseProps & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  rows = 4,
  ...rest
}: BaseProps & { rows?: number }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

/** "Bengali translation missing" marker shown next to bilingual fields. */
export function MissingBengali({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <p
      className={cn(
        "rounded-md border border-dashed border-amber-500/60 bg-amber-50 px-3 py-1.5 text-xs text-amber-900",
        className,
      )}
      role="note"
      data-testid="missing-bengali"
    >
      Bengali translation missing: the storefront shows the English text instead.
    </p>
  );
}

/** Every error at the top of the form, so a message on a hidden tab is not missed. */
export function ErrorSummary({
  message,
  fieldErrors,
}: {
  message: string | null;
  fieldErrors: Record<string, string>;
}) {
  const entries = Object.entries(fieldErrors);
  if (message === null && entries.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
      data-testid="form-errors"
    >
      {message === null ? null : <p className="font-medium text-destructive">{message}</p>}
      {entries.length === 0 ? null : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
          {entries.slice(0, 12).map(([path, text]) => (
            <li key={path}>
              <span className="font-mono">{path}</span>: {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shown wherever images are uploaded while the mock storage provider is active. */
export function MockStorageBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="inline-flex items-center rounded-sm border border-dashed border-amber-500 bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-amber-900 uppercase"
      title="Images are stored on this machine (public/uploads-dev), not in Cloudinary."
      data-testid="mock-storage-badge"
    >
      Mock storage
    </span>
  );
}
