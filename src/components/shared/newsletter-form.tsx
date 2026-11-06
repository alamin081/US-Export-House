"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Newsletter sign-up.
 *
 * PHASE 3: nothing is sent anywhere. The form only exercises the validation,
 * pending and success states so they can be reviewed; the Server Action that
 * stores the address is added later.
 */
export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const t = useTranslations("Newsletter");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "done">("idle");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    setState(isValid ? "done" : "error");
  }

  if (state === "done") {
    return (
      <p
        className={
          tone === "dark"
            ? "flex items-center gap-2 text-sm text-primary-foreground"
            : "flex items-center gap-2 text-sm"
        }
        role="status"
      >
        <Check aria-hidden="true" className="size-4" />
        {t("success")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full max-w-md">
      <Label
        htmlFor="newsletter-email"
        className={tone === "dark" ? "text-primary-foreground" : undefined}
      >
        {t("label")}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t("placeholder")}
          value={email}
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "newsletter-error" : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === "error") setState("idle");
          }}
          className="sm:flex-1"
        />
        <Button type="submit" variant={tone === "dark" ? "accent" : "primary"}>
          {t("submit")}
        </Button>
      </div>
      {state === "error" ? (
        <FieldHint id="newsletter-error" tone="error">
          {t("invalidEmail")}
        </FieldHint>
      ) : (
        <FieldHint className={tone === "dark" ? "text-primary-foreground/70" : undefined}>
          {t("hint")}
        </FieldHint>
      )}
    </form>
  );
}
