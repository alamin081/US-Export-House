"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/modules/access/auth.actions";

const MESSAGES: Record<Exclude<LoginState["error"], null>, string> = {
  // One message for every credential failure, so the form never reveals
  // whether an email has an account.
  invalid: "The email or password is not correct.",
  throttled: "Too many attempts. Wait 15 minutes, then try again.",
  unavailable: "Sign-in is unavailable right now. Please try again.",
};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          aria-invalid={state.error === "invalid"}
          aria-describedby={state.error === null ? undefined : "login-error"}
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error === "invalid"}
          aria-describedby={state.error === null ? undefined : "login-error"}
        />
      </div>

      {state.error === null ? null : (
        <p
          id="login-error"
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {MESSAGES[state.error]}
        </p>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        <LogIn aria-hidden="true" />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
