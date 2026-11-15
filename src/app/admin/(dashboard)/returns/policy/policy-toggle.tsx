"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setReturnPolicyAction } from "@/modules/returns/returns.actions";

export function PolicyToggle({ published }: { published: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm">
      {published ? null : (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I have read the policy and approve it for customers.
        </label>
      )}
      <div>
        <Button
          type="button"
          variant={published ? "outline" : "primary"}
          disabled={pending || (!published && !confirmed)}
          data-testid="policy-toggle"
          onClick={() =>
            startTransition(async () => {
              const result = await setReturnPolicyAction(!published);
              if (result.status !== "idle") setMessage(result.message);
              router.refresh();
            })
          }
        >
          {published ? "Take the policy down" : "Approve and publish"}
        </Button>
      </div>
      {message === null ? null : <p role="status">{message}</p>}
    </div>
  );
}
