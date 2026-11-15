"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { closeDayAction } from "@/modules/pos/pos.actions";

export function CloseDayForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const field = "h-10 rounded-md border border-input bg-card px-3 text-sm";
  return (
    <form
      className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-4 text-sm"
      data-testid="close-day"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await closeDayAction(sessionId, { countedCash: counted, reason });
          if (result.status === "success") router.refresh();
          else if (result.status === "error") setError(result.message);
        });
      }}
    >
      <p className="w-full font-medium">
        Close the day: count the cash in the drawer. Afterwards no bill of this day can change.
      </p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Counted cash (taka)
        <input
          className={field}
          name="countedCash"
          inputMode="decimal"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
        />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Reason for any difference
        <input
          className={field}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        Close the day
      </Button>
      {error === null ? null : (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
