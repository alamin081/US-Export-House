"use client";

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MediaImage } from "@/components/shared/media-image";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import { calculateTotals, type MockCartLine, type ShippingZoneId } from "@/modules/cart/cart.mock";

/**
 * Checkout form.
 *
 * PHASE 3: layout, field order and the validation/error states only. The real
 * flow (Phase 8) validates with Zod on the server, recalculates every amount
 * from the database, reserves stock with a conditional update inside one
 * transaction, and only then creates the order - so nothing here submits.
 */
type FieldName = "fullName" | "phone" | "addressLine" | "area" | "city";

const BD_PHONE = /^01[3-9]\d{8}$/;

export function CheckoutForm({ lines }: { lines: readonly MockCartLine[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");

  const [zone, setZone] = useState<ShippingZoneId>("inside_dhaka");
  const [payment, setPayment] = useState<"cod" | "online">("cod");
  const [values, setValues] = useState<Record<FieldName, string>>({
    fullName: "",
    phone: "",
    addressLine: "",
    area: "",
    city: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  /** Set when the form validates: Phase 3 stops here instead of ordering. */
  const [validated, setValidated] = useState(false);

  const totals = useMemo(() => calculateTotals(lines, zone), [lines, zone]);

  function setField(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setValidated(false);
    setErrors((current) => {
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }

  /** Mirrors the Zod rules that will run on the server in Phase 8. */
  function validate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<FieldName, string>> = {};

    for (const field of ["fullName", "addressLine", "area", "city"] as const) {
      if (values[field].trim() === "") nextErrors[field] = t("requiredField");
    }
    if (!BD_PHONE.test(values.phone.trim())) {
      nextErrors.phone = t("invalidPhone");
    }

    setErrors(nextErrors);
    setValidated(Object.keys(nextErrors).length === 0);
  }

  return (
    <form onSubmit={validate} noValidate className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
      <div className="flex flex-col gap-10">
        <p className="rounded-md border border-dashed border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          {t("guestNote")}
        </p>

        {/* Contact */}
        <section aria-labelledby="checkout-contact">
          <h2 id="checkout-contact" className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("contactHeading")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName" required>
                {t("fullName")}
              </Label>
              <Input
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={values.fullName}
                aria-invalid={errors.fullName !== undefined}
                aria-describedby={errors.fullName === undefined ? undefined : "fullName-error"}
                onChange={(event) => setField("fullName", event.target.value)}
              />
              {errors.fullName === undefined ? null : (
                <FieldHint id="fullName-error" tone="error">
                  {errors.fullName}
                </FieldHint>
              )}
            </div>

            <div>
              <Label htmlFor="phone" required>
                {t("phone")}
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01712345678"
                value={values.phone}
                aria-invalid={errors.phone !== undefined}
                aria-describedby={errors.phone === undefined ? "phone-hint" : "phone-error"}
                onChange={(event) => setField("phone", event.target.value)}
              />
              {errors.phone === undefined ? (
                <FieldHint id="phone-hint">{t("phoneHint")}</FieldHint>
              ) : (
                <FieldHint id="phone-error" tone="error">
                  {errors.phone}
                </FieldHint>
              )}
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section aria-labelledby="checkout-delivery">
          <h2 id="checkout-delivery" className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("deliveryHeading")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="addressLine" required>
                {t("addressLine")}
              </Label>
              <Input
                id="addressLine"
                name="addressLine"
                autoComplete="street-address"
                value={values.addressLine}
                aria-invalid={errors.addressLine !== undefined}
                aria-describedby={
                  errors.addressLine === undefined ? undefined : "addressLine-error"
                }
                onChange={(event) => setField("addressLine", event.target.value)}
              />
              {errors.addressLine === undefined ? null : (
                <FieldHint id="addressLine-error" tone="error">
                  {errors.addressLine}
                </FieldHint>
              )}
            </div>

            <div>
              <Label htmlFor="area" required>
                {t("area")}
              </Label>
              <Input
                id="area"
                name="area"
                value={values.area}
                aria-invalid={errors.area !== undefined}
                aria-describedby={errors.area === undefined ? undefined : "area-error"}
                onChange={(event) => setField("area", event.target.value)}
              />
              {errors.area === undefined ? null : (
                <FieldHint id="area-error" tone="error">
                  {errors.area}
                </FieldHint>
              )}
            </div>

            <div>
              <Label htmlFor="city" required>
                {t("city")}
              </Label>
              <Input
                id="city"
                name="city"
                autoComplete="address-level2"
                value={values.city}
                aria-invalid={errors.city !== undefined}
                aria-describedby={errors.city === undefined ? undefined : "city-error"}
                onChange={(event) => setField("city", event.target.value)}
              />
              {errors.city === undefined ? null : (
                <FieldHint id="city-error" tone="error">
                  {errors.city}
                </FieldHint>
              )}
            </div>

            <div>
              <Label htmlFor="postcode">{t("postcode")}</Label>
              <Input id="postcode" name="postcode" inputMode="numeric" autoComplete="postal-code" />
            </div>

            <div>
              <Label htmlFor="zone">{t("zone")}</Label>
              <Select
                id="zone"
                name="zone"
                value={zone}
                onChange={(event) => setZone(event.target.value as ShippingZoneId)}
              >
                <option value="inside_dhaka">{tCart("insideDhaka")}</option>
                <option value="outside_dhaka">{tCart("outsideDhaka")}</option>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="notes">{t("notes")}</Label>
              <Textarea id="notes" name="notes" rows={3} placeholder={t("notesPlaceholder")} />
            </div>
          </div>
        </section>

        {/* Payment */}
        <section aria-labelledby="checkout-payment">
          <h2 id="checkout-payment" className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("paymentHeading")}
          </h2>

          <div className="mt-5 flex flex-col gap-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 has-checked:border-foreground">
              <Radio
                name="payment"
                value="cod"
                checked={payment === "cod"}
                onChange={() => setPayment("cod")}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{t("paymentCod")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("paymentCodNote")}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-input p-4 opacity-60">
              <Radio name="payment" value="online" disabled className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{t("paymentOnline")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("paymentOnlineNote")}
                </span>
              </span>
            </label>
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("reviewHeading")}
          </h2>

          <ul className="mt-5 flex flex-col gap-4">
            {lines.map((line) => (
              <li key={line.lineId} className="flex gap-3">
                <div className="w-14 shrink-0">
                  <MediaImage
                    src={line.image}
                    alt={localize(line.name, locale)}
                    ratio="product"
                    className="rounded-sm"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium">{localize(line.name, locale)}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {line.size} · {localize(line.colour, locale)} · {line.quantity}
                  </p>
                </div>
                <span className="text-xs tabular-nums">
                  {formatMoney(line.unitPricePoisha * line.quantity, locale)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-6 flex flex-col gap-2.5 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{tCart("subtotal")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotalPoisha, locale)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{tCart("shipping")}</dt>
              <dd className="tabular-nums">
                {totals.shippingPoisha === 0
                  ? tCart("shippingFree")
                  : formatMoney(totals.shippingPoisha, locale)}
              </dd>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-4 text-base font-semibold">
              <dt>{tCart("total")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.totalPoisha, locale)}</dd>
            </div>
          </dl>

          <Button type="submit" size="lg" full className="mt-6">
            <Lock aria-hidden="true" />
            {t("placeOrder")}
          </Button>
          {validated ? (
            <p
              role="status"
              className="mt-3 rounded-md border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground"
            >
              {t("placeOrderDisabled")}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">{t("placeOrderDisabled")}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("termsNote")}</p>
        </div>

        <SampleContentNote className="mt-4" />
      </aside>
    </form>
  );
}
