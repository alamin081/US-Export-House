"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decideRefundAction } from "@/modules/returns/returns.actions";

export function RefundDecision({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await decideRefundAction(refundId, { approve, reason });
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => decide(true)}>
        Approve
      </Button>
      <input
        aria-label="Reason to refuse"
        placeholder="Reason to refuse"
        className="h-9 w-48 rounded-md border border-input bg-card px-3 text-sm"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => decide(false)}
      >
        Refuse
      </Button>
      {error === null ? null : (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
