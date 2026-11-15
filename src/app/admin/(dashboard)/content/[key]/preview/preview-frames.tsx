"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "mobile", label: "Phone", width: 390, height: 844 },
  { key: "tablet", label: "Tablet", width: 768, height: 1024 },
  { key: "desktop", label: "Desktop", width: 1280, height: 900 },
] as const;

/** Device-size frames of the storefront in draft-preview mode. */
export function PreviewFrames({ documentKey }: { documentKey: string }) {
  const [size, setSize] = useState<(typeof SIZES)[number]["key"]>("mobile");
  const [locale, setLocale] = useState<"bn" | "en">("bn");
  const [at, setAt] = useState("");
  const [nonce, setNonce] = useState(0);
  const chosen = SIZES.find((entry) => entry.key === size)!;
  const query = new URLSearchParams({ key: documentKey, locale });
  if (at !== "") query.set("at", `${at}:00+06:00`);
  const src = `/api/admin/preview?${query.toString()}&n=${nonce}`;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3">
        <div className="flex gap-1" role="group" aria-label="Screen size">
          {SIZES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSize(entry.key)}
              aria-pressed={size === entry.key}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                size === entry.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border",
              )}
              data-testid={`preview-size-${entry.key}`}
            >
              {entry.label} ({entry.width}px)
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Language">
          {(["bn", "en"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setLocale(entry)}
              aria-pressed={locale === entry}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                locale === entry
                  ? "border-foreground bg-foreground text-background"
                  : "border-border",
              )}
            >
              {entry === "bn" ? "বাংলা" : "English"}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Show as at (Bangladesh time, optional)
          <Input type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
        </label>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={() => setNonce((value) => value + 1)}
        >
          Reload
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="ms-auto text-sm underline underline-offset-4"
        >
          Open in a new tab
        </a>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-4">
        <iframe
          key={src}
          title={`Preview at ${chosen.label} size`}
          src={src}
          style={{ width: chosen.width, height: chosen.height }}
          className="mx-auto block rounded-md border border-border bg-background shadow-sm"
          data-testid="preview-frame"
        />
      </div>
    </div>
  );
}
