"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  blockPhoneAction,
  unblockPhoneAction,
} from "@/modules/checkout-admin/checkout-admin.actions";
import { TextField } from "../catalogue/fields";

export function BlockPhoneForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string; field?: string } | null>(
    null,
  );
  const errorFor = (field: string) =>
    message?.ok === false && message.field === field ? message.text : undefined;

  return (
    <form
      className="mt-6 grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await blockPhoneAction({ phone, reason });
          if (result.status === "success") {
            setMessage({ ok: true, text: result.message });
            setPhone("");
            setReason("");
            router.refresh();
          } else if (result.status === "error") {
            setMessage({
              ok: false,
              text: result.message,
              ...(result.field === undefined ? {} : { field: result.field }),
            });
          }
        });
      }}
    >
      <TextField
        label="Mobile number"
        type="tel"
        required
        value={phone}
        onChange={setPhone}
        error={errorFor("phone")}
      />
      <TextField
        label="Reason"
        required
        value={reason}
        onChange={setReason}
        error={errorFor("reason")}
      />
      <Button type="submit" disabled={pending}>
        <Ban aria-hidden="true" />
        Block
      </Button>
      {message === null || message.field !== undefined ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm sm:col-span-3 ${message.ok ? "text-success" : "text-destructive"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

export function UnblockButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await unblockPhoneAction(id);
          router.refresh();
        })
      }
    >
      Unblock
    </Button>
  );
}
