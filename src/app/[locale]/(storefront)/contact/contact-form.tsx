"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Contact form.
 *
 * PHASE 3: validation and success states only; the message is not sent
 * anywhere. Phase 12 wires it to the admin inbox.
 */
type Field = "name" | "phone" | "message";

const BD_PHONE = /^01[3-9]\d{8}$/;

export function ContactForm() {
  const t = useTranslations("Contact");
  const tCheckout = useTranslations("Checkout");
  const tPlaceholder = useTranslations("Placeholder");

  const [values, setValues] = useState<Record<Field, string>>({ name: "", phone: "", message: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sent, setSent] = useState(false);

  function setField(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<Field, string>> = {};
    if (values.name.trim() === "") nextErrors.name = tCheckout("requiredField");
    if (!BD_PHONE.test(values.phone.trim())) nextErrors.phone = tCheckout("invalidPhone");
    if (values.message.trim() === "") nextErrors.message = tCheckout("requiredField");

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="rounded-lg border border-border bg-card p-6 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Check aria-hidden="true" className="size-4" />
          {t("success")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{tPlaceholder("notConnected")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <Label htmlFor="contact-name" required>
          {t("name")}
        </Label>
        <Input
          id="contact-name"
          autoComplete="name"
          value={values.name}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name === undefined ? undefined : "contact-name-error"}
          onChange={(event) => setField("name", event.target.value)}
        />
        {errors.name === undefined ? null : (
          <FieldHint id="contact-name-error" tone="error">
            {errors.name}
          </FieldHint>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-phone" required>
            {t("phone")}
          </Label>
          <Input
            id="contact-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="01712345678"
            value={values.phone}
            aria-invalid={errors.phone !== undefined}
            aria-describedby={errors.phone === undefined ? undefined : "contact-phone-error"}
            onChange={(event) => setField("phone", event.target.value)}
          />
          {errors.phone === undefined ? null : (
            <FieldHint id="contact-phone-error" tone="error">
              {errors.phone}
            </FieldHint>
          )}
        </div>

        <div>
          <Label htmlFor="contact-email">{t("email")}</Label>
          <Input id="contact-email" type="email" autoComplete="email" />
        </div>
      </div>

      <div>
        <Label htmlFor="contact-subject">{t("subject")}</Label>
        <Select id="contact-subject" defaultValue="order">
          <option value="order">{t("subjectOrder")}</option>
          <option value="product">{t("subjectProduct")}</option>
          <option value="return">{t("subjectReturn")}</option>
          <option value="other">{t("subjectOther")}</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="contact-message" required>
          {t("message")}
        </Label>
        <Textarea
          id="contact-message"
          placeholder={t("messagePlaceholder")}
          value={values.message}
          aria-invalid={errors.message !== undefined}
          aria-describedby={errors.message === undefined ? undefined : "contact-message-error"}
          onChange={(event) => setField("message", event.target.value)}
        />
        {errors.message === undefined ? null : (
          <FieldHint id="contact-message-error" tone="error">
            {errors.message}
          </FieldHint>
        )}
      </div>

      <Button type="submit" size="lg" className="self-start">
        <Send aria-hidden="true" />
        {t("submit")}
      </Button>
    </form>
  );
}
