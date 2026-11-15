"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { addCustomerNoteAction } from "@/modules/orders/orders.actions";

export function CustomerNoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addCustomerNoteAction(orderId, { body });
          if (result.status === "success") {
            setBody("");
            setError(null);
            router.refresh();
          } else if (result.status === "error") {
            setError(result.message);
          }
        });
      }}
    >
      <textarea
        aria-label="New customer note"
        rows={2}
        className="rounded-md border border-input bg-card px-3 py-2 text-sm"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Add note
        </Button>
      </div>
    </form>
  );
}
