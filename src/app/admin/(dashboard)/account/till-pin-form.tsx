"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setOwnPinAction } from "@/modules/pos/pos.actions";

/** A manager's till PIN, typed at a counter to allow a discount above the seller's limit. */
export function TillPinForm() {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "h-10 rounded-md border border-input bg-card px-3 text-sm";
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      data-testid="till-pin-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setOwnPinAction({ password, pin });
          if (result.status === "idle") return;
          setMessage({ ok: result.status === "success", text: result.message });
          if (result.status === "success") {
            setPassword("");
            setPin("");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Your password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className={field}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        New PIN (4–8 digits)
        <input
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          className={field}
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        Save PIN
      </Button>
      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "w-full text-success" : "w-full text-destructive"}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
