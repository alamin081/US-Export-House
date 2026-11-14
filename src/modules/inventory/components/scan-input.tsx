"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ScannedItem {
  variantId: string;
  sku: string;
  barcode: string | null;
  name: string;
  isActive: boolean;
}

/** Short beeps through Web Audio: high for a match, low for an unknown code. */
function beep(ok: boolean) {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor === undefined) return;
    const context = new AudioCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = ok ? 1046 : 220;
    oscillator.type = ok ? "sine" : "square";
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (ok ? 0.08 : 0.25));
    oscillator.onended = () => void context.close();
  } catch {
    // Sound is a nicety; the visual signal below always shows.
  }
}

/**
 * "Scan / SKU" input. A USB barcode scanner types like a keyboard and ends
 * with Enter, so no hardware integration is needed: Enter looks the code up
 * (exact barcode, then SKU in any case). A match beeps, flashes green and is
 * handed to `onItem`; an unknown code beeps low and shows an error — it is
 * never added. "Find by name" searches when there is no barcode to scan.
 */
export function ScanInput({
  onItem,
  label = "Scan / SKU",
  autoFocus = true,
  disabled = false,
}: {
  onItem: (item: ScannedItem) => void | Promise<void>;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [signal, setSignal] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScannedItem[]>([]);

  useEffect(() => {
    if (signal === null) return;
    const timer = setTimeout(() => setSignal(null), signal.ok ? 1500 : 6000);
    return () => clearTimeout(timer);
  }, [signal]);

  // Scanners can fire faster than a lookup completes: codes are queued and
  // processed in order, never dropped. The latest `onItem` is always used.
  const queue = useRef<string[]>([]);
  const draining = useRef(false);
  const onItemRef = useRef(onItem);
  useEffect(() => {
    onItemRef.current = onItem;
  }, [onItem]);

  const process = async (value: string) => {
    try {
      const response = await fetch(`/api/admin/inventory/lookup?code=${encodeURIComponent(value)}`);
      const body = (await response.json()) as { item?: ScannedItem; error?: { message?: string } };
      if (!response.ok || body.item === undefined) {
        beep(false);
        setSignal({ ok: false, text: body.error?.message ?? `Unknown code "${value}".` });
        return;
      }
      try {
        await onItemRef.current(body.item);
      } catch (error) {
        // The screen refused the item (e.g. not on this transfer): never added.
        beep(false);
        setSignal({
          ok: false,
          text: error instanceof Error ? error.message : "Item not accepted.",
        });
        return;
      }
      beep(true);
      setSignal({ ok: true, text: `${body.item.sku} — ${body.item.name}` });
    } catch {
      beep(false);
      setSignal({ ok: false, text: "Lookup failed. Check the connection and scan again." });
    }
  };

  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    setBusy(true);
    try {
      for (let next = queue.current.shift(); next !== undefined; next = queue.current.shift()) {
        await process(next);
      }
    } finally {
      draining.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const lookUp = () => {
    const value = code.trim();
    setCode("");
    if (value === "") return;
    queue.current.push(value);
    void drain();
  };

  const search = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const response = await fetch(`/api/admin/inventory/lookup?q=${encodeURIComponent(value)}`);
    if (response.ok) setResults(((await response.json()) as { items: ScannedItem[] }).items);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="scan-input"
          className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
        >
          <ScanLine aria-hidden="true" className="size-4" />
          {label}
        </label>
        <Input
          id="scan-input"
          ref={inputRef}
          value={code}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          inputMode="text"
          placeholder="Scan a barcode or type a SKU, then Enter"
          data-testid="scan-input"
          className={cn(
            "text-base transition-colors",
            signal?.ok === true && "border-success bg-success/10",
            signal?.ok === false && "border-destructive bg-destructive/10",
          )}
          aria-busy={busy}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              lookUp();
            }
          }}
        />
        <p
          role={signal?.ok === false ? "alert" : "status"}
          data-testid="scan-signal"
          className={cn(
            "mt-1.5 min-h-5 text-xs",
            signal?.ok === true ? "text-success" : "text-destructive",
          )}
        >
          {signal?.text ?? ""}
        </p>
      </div>

      <details className="text-sm">
        <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <Search aria-hidden="true" className="size-3.5" />
          Find by name
        </summary>
        <div className="mt-2">
          <Input
            value={query}
            aria-label="Find an item by name, SKU or barcode"
            placeholder="Product name, SKU or barcode"
            onChange={(event) => void search(event.target.value)}
          />
          {results.length === 0 ? null : (
            <ul className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
              {results.map((item) => (
                <li key={item.variantId}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-secondary"
                    onClick={() => {
                      void onItem(item);
                      setResults([]);
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="font-medium tabular-nums">{item.sku}</span>
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
