"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  applyCountAction,
  countStepAction,
  recordCountAction,
} from "@/modules/inventory/inventory.actions";
import { ScanInput } from "@/modules/inventory/components/scan-input";

export interface CountLine {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  systemQty: number;
  movementsSinceSnapshot: number;
  expectedQty: number;
  countedQty: number | null;
  difference: number | null;
}

/**
 * The counting screen: built for a phone or tablet with a USB / Bluetooth
 * scanner. Every scan adds one; a number can also be typed per line. Lines
 * update from the server after each change.
 */
export function CountScreen({
  countId,
  lines,
  can,
  uncounted,
}: {
  countId: string;
  lines: readonly CountLine[];
  can: { record: boolean; submit: boolean; apply: boolean; cancel: boolean };
  uncounted: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [zeroUncounted, setZeroUncounted] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [filter, setFilter] = useState<"all" | "uncounted" | "different">("all");

  const counted = lines.length - uncounted;
  const shown = lines.filter((line) =>
    filter === "uncounted"
      ? line.countedQty === null
      : filter === "different"
        ? (line.difference ?? 0) !== 0
        : true,
  );

  const done = (result: { status: "success" | "error"; message: string }) => {
    setMessage({ ok: result.status === "success", text: result.message });
    if (result.status === "success") router.refresh();
  };

  const setCounted = (line: CountLine) => {
    const value = drafts[line.id];
    if (value === undefined || value.trim() === "") return;
    startTransition(async () => {
      done(
        await recordCountAction({
          countId,
          mode: "set",
          variantId: line.variantId,
          countedQty: value,
        }),
      );
      setDrafts((current) => {
        const { [line.id]: _removed, ...rest } = current;
        return rest;
      });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {can.record ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <ScanInput
            label="Scan each item on the shelf"
            onItem={async (item) => {
              const result = await recordCountAction({
                countId,
                mode: "scan",
                code: item.barcode ?? item.sku,
              });
              if (result.status === "error") throw new Error(result.message);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="tabular-nums" data-testid="count-progress">
          {counted} of {lines.length} lines counted
          {uncounted > 0 ? ` · ${uncounted} not counted yet` : ""}
        </span>
        <span className="flex gap-1 rounded-md border border-border p-0.5">
          {(["all", "uncounted", "different"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs",
                filter === value ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              {value === "all" ? "All" : value === "uncounted" ? "Not counted" : "Differences"}
            </button>
          ))}
        </span>
      </div>

      <ul
        className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background"
        data-testid="count-lines"
      >
        {shown.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</li>
        ) : null}
        {shown.map((line) => (
          <li
            key={line.id}
            data-sku={line.sku}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 p-3 sm:grid-cols-[2fr_repeat(4,minmax(4.5rem,auto))]"
          >
            <span>
              <span className="block font-medium tabular-nums">{line.sku}</span>
              <span className="text-xs text-muted-foreground">{line.name}</span>
            </span>
            <span className="text-right text-xs text-muted-foreground sm:text-sm">
              <span className="block sm:hidden">expected</span>
              <span
                className="tabular-nums"
                title={`Snapshot ${line.systemQty}, ${line.movementsSinceSnapshot >= 0 ? "+" : ""}${line.movementsSinceSnapshot} since`}
              >
                {line.expectedQty}
              </span>
              {line.movementsSinceSnapshot === 0 ? null : (
                <span className="block text-[0.6875rem]">
                  ({line.systemQty} {line.movementsSinceSnapshot > 0 ? "+" : ""}
                  {line.movementsSinceSnapshot} since start)
                </span>
              )}
            </span>
            <span className="col-span-2 flex items-center gap-2 sm:col-span-2">
              {can.record ? (
                <>
                  <Input
                    className="h-10 w-24 text-right text-base"
                    inputMode="numeric"
                    aria-label={`Counted ${line.sku}`}
                    placeholder={line.countedQty === null ? "—" : String(line.countedQty)}
                    value={
                      drafts[line.id] ?? (line.countedQty === null ? "" : String(line.countedQty))
                    }
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [line.id]: event.target.value }))
                    }
                    onBlur={() => setCounted(line)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setCounted(line);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">counted</span>
                </>
              ) : (
                <span className="tabular-nums">counted {line.countedQty ?? "—"}</span>
              )}
            </span>
            <span
              className={cn(
                "text-right font-semibold tabular-nums",
                line.difference === null && "text-muted-foreground",
                (line.difference ?? 0) < 0 && "text-destructive",
                (line.difference ?? 0) > 0 && "text-success",
              )}
              data-testid="count-difference"
            >
              {line.difference === null
                ? "—"
                : line.difference > 0
                  ? `+${line.difference}`
                  : line.difference}
            </span>
          </li>
        ))}
      </ul>

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        {can.submit ? (
          <Button
            type="button"
            disabled={pending || counted === 0}
            data-testid="count-submit"
            onClick={() =>
              startTransition(async () => done(await countStepAction("submit", countId)))
            }
          >
            <Send aria-hidden="true" />
            Submit for review
          </Button>
        ) : null}
        {can.apply ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
            {uncounted > 0 ? (
              <>
                <p className="text-sm">
                  {uncounted} line(s) were not counted and will stay unchanged unless you set them
                  to 0.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={zeroUncounted}
                    onChange={(event) => setZeroUncounted(event.target.checked)}
                  />
                  Set every uncounted line of this count to 0
                </label>
                {zeroUncounted ? (
                  <label className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
                    <Checkbox
                      checked={confirmZero}
                      onChange={(event) => setConfirmZero(event.target.checked)}
                    />
                    I confirm: those items are really not on the shelf.
                  </label>
                ) : null}
              </>
            ) : null}
            <Button
              type="button"
              disabled={pending || (zeroUncounted && !confirmZero)}
              data-testid="count-apply"
              onClick={() =>
                startTransition(async () =>
                  done(
                    await applyCountAction({
                      countId,
                      zeroUncounted,
                      confirmZeroUncounted: confirmZero,
                    }),
                  ),
                )
              }
            >
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <CheckCheck aria-hidden="true" />
              )}
              Apply corrections
            </Button>
          </div>
        ) : null}
        {can.cancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Cancel this count? Nothing will be changed.")) {
                startTransition(async () => done(await countStepAction("cancel", countId)));
              }
            }}
          >
            <XCircle aria-hidden="true" />
            Cancel count
          </Button>
        ) : null}
      </div>
    </div>
  );
}
