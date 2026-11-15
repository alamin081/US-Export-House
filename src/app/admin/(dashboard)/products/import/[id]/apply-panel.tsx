"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  applyImportAction,
  cancelImportAction,
} from "@/modules/catalog/import/product-import.actions";

interface Props {
  importId: string;
  status: string;
  mode: "ALL_OR_NOTHING" | "GOOD_ONLY";
  canApply: boolean;
  errorCount: number;
  plannedCount: number;
  allowPartial: boolean;
  atomicTooBig: boolean;
  atomicMaxRows: number;
  duplicate: { at: string | null; by: string | null } | null;
}

/**
 * Step 2: apply. All or nothing needs zero errors and runs in one go. Good
 * products only (when allowed) runs chunk after chunk with a progress bar; it
 * can be stopped and resumed from the history.
 */
export function ApplyPanel(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Props["mode"]>(
    props.status === "APPLYING"
      ? props.mode
      : props.atomicTooBig && props.allowPartial
        ? "GOOD_ONLY"
        : "ALL_OR_NOTHING",
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef(false);

  const resuming = props.status === "APPLYING" && props.mode === "GOOD_ONLY";
  const messageLine =
    message === null ? null : (
      <p
        role={message.ok ? "status" : "alert"}
        data-testid="import-apply-message"
        className={
          message.ok ? "flex items-center gap-2 text-sm text-success" : "text-sm text-destructive"
        }
      >
        {message.ok ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
        {message.text}
      </p>
    );
  // Finished (or not this person's check): only the outcome stays on screen.
  if (!props.canApply && !resuming) return messageLine;

  const blocked = mode === "ALL_OR_NOTHING" && (props.errorCount > 0 || props.atomicTooBig);
  const needsConfirm = props.duplicate !== null && !resuming;

  const run = () =>
    start(async () => {
      setMessage(null);
      stop.current = false;
      for (;;) {
        const result = await applyImportAction({
          importId: props.importId,
          mode,
          confirmDuplicate,
        });
        if (result.status === "error") {
          setMessage({ ok: false, text: result.message });
          break;
        }
        const data = result.data;
        if (mode === "GOOD_ONLY") {
          setProgress({
            done: (data.totalApplied ?? 0) + (data.totalSkipped ?? 0),
            total: data.total ?? props.plannedCount,
          });
        }
        if (data.done) {
          setMessage({ ok: true, text: "Import finished." });
          break;
        }
        if (stop.current) {
          setMessage({ ok: true, text: "Paused. Run it again from here to continue." });
          break;
        }
      }
      router.refresh();
    });

  const cancel = () =>
    start(async () => {
      const result = await cancelImportAction(props.importId);
      setMessage({ ok: result.status === "success", text: result.message });
      router.refresh();
    });

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
      aria-labelledby="apply-title"
      data-testid="import-apply"
    >
      <h2 id="apply-title" className="text-base font-semibold">
        Apply
      </h2>
      {props.allowPartial && !resuming ? (
        <div className="max-w-md">
          <Label htmlFor="import-mode">Mode</Label>
          <Select
            id="import-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as Props["mode"])}
          >
            <option value="ALL_OR_NOTHING">All or nothing (one error stops everything)</option>
            <option value="GOOD_ONLY">Good products only (skip the ones with errors)</option>
          </Select>
        </div>
      ) : null}
      {mode === "ALL_OR_NOTHING" && props.errorCount > 0 ? (
        <p className="text-sm text-destructive" lang="bn">
          ত্রুটি ০ হলে তবেই আমদানি করা যায়। “ত্রুটির তালিকা CSV” নামিয়ে ঠিক করে আবার আপলোড করুন।
        </p>
      ) : null}
      {mode === "ALL_OR_NOTHING" && props.atomicTooBig ? (
        <p className="text-sm text-destructive" lang="bn">
          সব-অথবা-কিছুই-না মোডে সর্বোচ্চ {props.atomicMaxRows} সারি। ফাইল ভাগ করুন
          {props.allowPartial ? ", অথবা “শুধু ভালোগুলো” মোড ব্যবহার করুন" : ""}।
        </p>
      ) : null}
      {needsConfirm ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <Checkbox
            id="confirm-duplicate"
            checked={confirmDuplicate}
            onChange={(event) => setConfirmDuplicate(event.target.checked)}
            data-testid="confirm-duplicate"
          />
          <label htmlFor="confirm-duplicate" lang="bn">
            এই ফাইল আগে আমদানি হয়েছে
            {props.duplicate?.by ? ` (${props.duplicate.by}` : ""}
            {props.duplicate?.at
              ? `, ${new Date(props.duplicate.at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })})`
              : props.duplicate?.by
                ? ")"
                : ""}
            । তবুও আবার আমদানি করব।
          </label>
        </div>
      ) : null}
      {progress === null ? null : (
        <div>
          <div
            className="h-2 overflow-hidden rounded bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${progress.total === 0 ? 100 : (progress.done / progress.total) * 100}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {progress.done} of {progress.total} products
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={run}
          disabled={pending || blocked || (needsConfirm && !confirmDuplicate)}
          data-testid="import-apply-button"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {resuming
            ? "Continue"
            : `Import ${props.plannedCount} product${props.plannedCount === 1 ? "" : "s"}`}
        </Button>
        {mode === "GOOD_ONLY" && pending ? (
          <Button type="button" variant="outline" onClick={() => (stop.current = true)}>
            <Square aria-hidden="true" />
            Pause
          </Button>
        ) : null}
        {!pending ? (
          <Button type="button" variant="ghost" onClick={cancel}>
            Discard this check
          </Button>
        ) : null}
      </div>
      {messageLine}
    </section>
  );
}
