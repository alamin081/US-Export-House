"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { IDLE, type ActionResult } from "@/modules/access/action-state";
import { changeOwnPasswordAction } from "@/modules/access/staff.actions";
import { FormMessage } from "../staff/form-message";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    changeOwnPasswordAction,
    IDLE,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div>
        <Label htmlFor="currentPassword" required>
          Current password
        </Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <Label htmlFor="newPassword" required>
          New password
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="newPassword-hint"
        />
        <FieldHint id="newPassword-hint">At least 12 characters. Longer is better.</FieldHint>
      </div>
      <div>
        <Label htmlFor="confirmPassword" required>
          Repeat new password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
