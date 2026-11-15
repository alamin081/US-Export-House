"use client";

import { Lock, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { announceCartUnits } from "@/components/shared/cart-events";
import { MediaImage } from "@/components/shared/media-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import type { CartViewLine } from "@/modules/cart/cart.service";
import { placeOrderAction, quoteCheckoutAction } from "@/modules/checkout/checkout.actions";
import type { PlaceOrderResult, QuoteView } from "@/modules/checkout/checkout.service";

interface GeoOption {
  id: string;
  nameEn: string;
  nameBn: string;
}

type Field = "name" | "phone" | "email" | "area" | "street" | "landmark" | "note";

const BD_MOBILE = /^(?:\+?88)?01[3-9]\d{8}$/;

/**
 * One-page guest checkout (cash on delivery). The browser shows the numbers
 * the server quoted and sends back their hash; the server rebuilds every
 * amount and refuses the order if anything moved in between.
 */
export function CheckoutForm({
  lines,
  divisions,
  formToken,
  idempotencyKey,
  storePhone,
  showReturnsLink,
  initialQuote,
}: {
  lines: readonly CartViewLine[];
  divisions: readonly GeoOption[];
  formToken: string;
  idempotencyKey: string;
  storePhone: string;
  showReturnsLink: boolean;
  /** Quoted on the server without an address yet: subtotal and total. */
  initialQuote: QuoteView | null;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const router = useRouter();
  const name = (option: GeoOption) => (locale === "bn" ? option.nameBn : option.nameEn);

  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    phone: "",
    email: "",
    area: "",
    street: "",
    landmark: "",
    note: "",
  });
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [upazilaId, setUpazilaId] = useState("");
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [upazilas, setUpazilas] = useState<GeoOption[]>([]);

  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(initialQuote);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [quoting, setQuoting] = useState(false);
  const quoteRun = useRef(0);

  const area =
    divisionId !== "" && districtId !== "" && upazilaId !== ""
      ? { divisionId, districtId, upazilaId }
      : null;

  function couponText(result: QuoteView): string | null {
    switch (result.couponProblem) {
      case "INVALID":
        return t("couponInvalid");
      case "EXPIRED":
        return t("couponExpired");
      case "NOT_APPLICABLE":
        return t("couponNotApplicable");
      case "MIN_SUBTOTAL":
        return t("couponMinimum", { amount: formatMoney(result.couponMinPoisha ?? 0, locale) });
      case "RATE_LIMITED":
        return t("couponRateLimited");
      default:
        return null;
    }
  }

  /** Asks the server for the numbers; the latest request wins. */
  async function requote(code: string | null, forArea: typeof area) {
    const run = ++quoteRun.current;
    setQuoting(true);
    const result = await quoteCheckoutAction({
      area: forArea,
      couponCode: code,
      phone: values.phone,
    });
    if (run !== quoteRun.current) return;
    setQuoting(false);
    if (!result.ok) {
      if (result.error === "CART_EMPTY") router.replace("/cart");
      return;
    }
    setQuote(result.quote);
    if (code !== null) {
      if (result.quote.coupon === null) {
        setCouponCode(null);
        setCouponMessage(couponText(result.quote));
      } else {
        setCouponMessage(null);
      }
    }
  }

  async function loadDistricts(id: string) {
    setDivisionId(id);
    setDistrictId("");
    setUpazilaId("");
    setDistricts([]);
    setUpazilas([]);
    if (id === "") return;
    const response = await fetch(`/api/geo/districts?division=${encodeURIComponent(id)}`);
    if (response.ok)
      setDistricts(((await response.json()) as { districts: GeoOption[] }).districts);
  }

  async function loadUpazilas(id: string) {
    setDistrictId(id);
    setUpazilaId("");
    setUpazilas([]);
    if (id === "") return;
    const response = await fetch(`/api/geo/upazilas?district=${encodeURIComponent(id)}`);
    if (response.ok) setUpazilas(((await response.json()) as { upazilas: GeoOption[] }).upazilas);
  }

  function setField(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  }

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) next.name = t("requiredField");
    if (!BD_MOBILE.test(values.phone.replace(/[\s-]/g, ""))) next.phone = t("invalidPhone");
    if (values.email.trim() !== "" && !/^\S+@\S+\.\S+$/.test(values.email.trim())) {
      next.email = t("invalidEmail");
    }
    if (area === null) next.area = t("chooseArea");
    if (values.street.trim().length < 5) next.street = t("streetTooShort");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function errorMessage(result: Extract<PlaceOrderResult, { ok: false }>): string {
    switch (result.error) {
      case "INVALID_PHONE":
        return t("invalidPhone");
      case "QUOTE_CHANGED":
        return t("quoteChanged");
      case "COUPON_INVALID":
        return t("couponNoLongerValid");
      case "OUT_OF_STOCK":
        return t("outOfStock", { skus: (result.skus ?? []).join(", ") });
      case "COD_LIMIT":
        return storePhone === "" ? t("codLimit") : t("codLimitCall", { phone: storePhone });
      case "DUPLICATE":
        return t("duplicate", { orderNumber: result.orderNumber ?? "" });
      case "ORDER_LIMIT":
      case "NOT_ACCEPTED":
        return storePhone === "" ? t("notAccepted") : t("notAcceptedCall", { phone: storePhone });
      case "TOO_FAST":
        return t("tooFast");
      case "FORM_EXPIRED":
        return t("formExpired");
      case "CART_EMPTY":
      case "CART_CHANGED":
        return t("cartChanged");
      case "ADDRESS_INVALID":
        return t("chooseArea");
      default:
        return t("failed");
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!validate() || quote === null || area === null) return;
    startTransition(async () => {
      const result = await placeOrderAction({
        name: values.name,
        phone: values.phone,
        email: values.email,
        area,
        street: values.street,
        landmark: values.landmark,
        note: values.note,
        couponCode,
        paymentMethod: "COD",
        quoteHash: quote.hash,
        idempotencyKey,
        formToken,
        website,
      });
      if (result.ok) {
        announceCartUnits(0);
        router.replace(`/order/${result.publicToken}`);
        return;
      }
      if (result.quote !== undefined) setQuote(result.quote);
      if (result.error === "COUPON_INVALID") setCouponCode(null);
      if (result.error === "CART_CHANGED" || result.error === "CART_EMPTY") {
        router.replace("/cart");
        return;
      }
      if (result.field === "phone")
        setErrors((current) => ({ ...current, phone: t("invalidPhone") }));
      setNotice(errorMessage(result));
    });
  }

  const sectionTitle = "text-sm font-semibold tracking-[0.18em] uppercase";
  const fieldError = (field: Field) =>
    errors[field] === undefined ? null : (
      <FieldHint id={`${field}-error`} tone="error">
        {errors[field]}
      </FieldHint>
    );
  // Missing fields are reported on submit; only a known COD refusal disables it.
  const canSubmit = quote !== null && quote.codAllowed;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16"
      data-testid="checkout-form"
      aria-busy={pending}
    >
      <div className="flex flex-col gap-10">
        {/* Honeypot: invisible to people and screen readers. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        {/* Contact */}
        <section aria-labelledby="checkout-contact">
          <h2 id="checkout-contact" className={sectionTitle}>
            {t("contactHeading")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>
                {t("fullName")}
              </Label>
              <Input
                id="name"
                autoComplete="name"
                value={values.name}
                aria-invalid={errors.name !== undefined}
                onChange={(event) => setField("name", event.target.value)}
              />
              {fieldError("name")}
            </div>
            <div>
              <Label htmlFor="phone" required>
                {t("phone")}
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
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
                fieldError("phone")
              )}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">{t("emailOptional")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={values.email}
                aria-invalid={errors.email !== undefined}
                onChange={(event) => setField("email", event.target.value)}
              />
              {fieldError("email")}
            </div>
          </div>
        </section>

        {/* Address */}
        <section aria-labelledby="checkout-delivery">
          <h2 id="checkout-delivery" className={sectionTitle}>
            {t("deliveryHeading")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <Label htmlFor="division" required>
                {t("division")}
              </Label>
              <Select
                id="division"
                value={divisionId}
                aria-invalid={errors.area !== undefined && divisionId === ""}
                onChange={(event) => {
                  setField("area", "");
                  void loadDistricts(event.target.value);
                }}
              >
                <option value="">{t("choose")}</option>
                {divisions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {name(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="district" required>
                {t("district")}
              </Label>
              <Select
                id="district"
                value={districtId}
                disabled={districts.length === 0}
                onChange={(event) => {
                  setField("area", "");
                  void loadUpazilas(event.target.value);
                }}
              >
                <option value="">{t("choose")}</option>
                {districts.map((option) => (
                  <option key={option.id} value={option.id}>
                    {name(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="upazila" required>
                {t("upazila")}
              </Label>
              <Select
                id="upazila"
                value={upazilaId}
                disabled={upazilas.length === 0}
                onChange={(event) => {
                  setField("area", "");
                  const next = event.target.value;
                  setUpazilaId(next);
                  void requote(
                    couponCode,
                    next === "" ? null : { divisionId, districtId, upazilaId: next },
                  );
                }}
              >
                <option value="">{t("choose")}</option>
                {upazilas.map((option) => (
                  <option key={option.id} value={option.id}>
                    {name(option)}
                  </option>
                ))}
              </Select>
            </div>
            {errors.area === undefined ? null : (
              <div className="-mt-3 sm:col-span-3">{fieldError("area")}</div>
            )}
            <div className="sm:col-span-3">
              <Label htmlFor="street" required>
                {t("street")}
              </Label>
              <Input
                id="street"
                autoComplete="street-address"
                placeholder={t("streetPlaceholder")}
                value={values.street}
                aria-invalid={errors.street !== undefined}
                onChange={(event) => setField("street", event.target.value)}
              />
              {fieldError("street")}
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="landmark">{t("landmarkOptional")}</Label>
              <Input
                id="landmark"
                value={values.landmark}
                onChange={(event) => setField("landmark", event.target.value)}
              />
            </div>
          </div>

          {/* The zone follows from the address; the customer cannot pick it. */}
          <p
            className="mt-4 flex items-center gap-2 rounded-md bg-secondary/60 px-4 py-3 text-sm"
            data-testid="delivery-zone"
            data-zone={quote?.zone?.code ?? ""}
          >
            <Truck aria-hidden="true" className="size-4 shrink-0" />
            {quote?.zone == null
              ? t("zonePending")
              : t("zoneLine", {
                  zone:
                    locale === "bn" ? (quote.zone.nameBn ?? quote.zone.nameEn) : quote.zone.nameEn,
                  amount:
                    quote.shippingPoisha === 0
                      ? tCart("shippingFree")
                      : formatMoney(quote.shippingPoisha, locale),
                })}
          </p>
        </section>

        {/* Coupon */}
        <section aria-labelledby="checkout-coupon">
          <h2 id="checkout-coupon" className={sectionTitle}>
            {t("couponHeading")}
          </h2>
          <div className="mt-5 flex gap-2">
            <Input
              id="coupon"
              aria-label={t("couponHeading")}
              value={couponInput}
              placeholder={t("couponPlaceholder")}
              autoCapitalize="characters"
              onChange={(event) => setCouponInput(event.target.value)}
            />
            {couponCode === null ? (
              <Button
                type="button"
                variant="outline"
                data-testid="coupon-apply"
                disabled={couponInput.trim() === "" || quoting}
                onClick={() => {
                  const code = couponInput.trim();
                  setCouponCode(code);
                  void requote(code, area);
                }}
              >
                {t("couponApply")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCouponCode(null);
                  setCouponInput("");
                  setCouponMessage(null);
                  void requote(null, area);
                }}
              >
                {t("couponRemove")}
              </Button>
            )}
          </div>
          {couponMessage !== null ? (
            <FieldHint tone="error" data-testid="coupon-message">
              {couponMessage}
            </FieldHint>
          ) : quote?.coupon == null ? null : (
            <FieldHint data-testid="coupon-message">
              {t("couponApplied", {
                code: quote.coupon.code,
              })}
            </FieldHint>
          )}
        </section>

        {/* Payment: cash on delivery only (online payment comes later). */}
        <section aria-labelledby="checkout-payment">
          <h2 id="checkout-payment" className={sectionTitle}>
            {t("paymentHeading")}
          </h2>
          <div className="mt-5 rounded-lg border border-foreground p-4">
            <p className="text-sm font-medium">{t("paymentCod")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("paymentCodNote")}</p>
          </div>
          {quote !== null && !quote.codAllowed ? (
            <FieldHint tone="error">
              {storePhone === "" ? t("codLimit") : t("codLimitCall", { phone: storePhone })}
            </FieldHint>
          ) : null}
        </section>

        {/* Note */}
        <section aria-labelledby="checkout-note">
          <Label htmlFor="note">{t("notes")}</Label>
          <Textarea
            id="note"
            rows={3}
            placeholder={t("notesPlaceholder")}
            value={values.note}
            onChange={(event) => setField("note", event.target.value)}
          />
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <h2 className={sectionTitle}>{t("reviewHeading")}</h2>
          <ul className="mt-5 flex flex-col gap-4">
            {lines.map((line) => (
              <li key={line.variantId} className="flex gap-3">
                <div className="w-14 shrink-0">
                  {line.imageUrl === null ? (
                    <div className="aspect-[4/5] rounded-sm bg-secondary" />
                  ) : (
                    <MediaImage
                      src={line.imageUrl}
                      alt={localize(line.name, locale)}
                      ratio="product"
                      className="rounded-sm"
                      sizes="56px"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium">{localize(line.name, locale)}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {[line.size, line.colour]
                      .filter((option) => option !== null)
                      .map((option) => localize(option, locale))
                      .join(" · ")}{" "}
                    × {line.quantity}
                  </p>
                </div>
                <span className="text-xs tabular-nums">
                  {formatMoney(line.lineTotalPoisha, locale)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-6 flex flex-col gap-2.5 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{tCart("subtotal")}</dt>
              <dd className="tabular-nums">
                {quote === null ? "…" : formatMoney(quote.subtotalPoisha, locale)}
              </dd>
            </div>
            {quote !== null && quote.discountPoisha > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("discount")}</dt>
                <dd className="text-destructive tabular-nums" data-testid="summary-discount">
                  −{formatMoney(quote.discountPoisha, locale)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{tCart("shipping")}</dt>
              <dd className="tabular-nums" data-testid="summary-shipping">
                {quote?.zone == null
                  ? t("shippingAfterAddress")
                  : quote.shippingPoisha === 0
                    ? tCart("shippingFree")
                    : formatMoney(quote.shippingPoisha, locale)}
              </dd>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-4 text-base font-semibold">
              <dt>{tCart("total")}</dt>
              <dd className="tabular-nums" data-testid="summary-total">
                {quote === null ? "…" : formatMoney(quote.totalPoisha, locale)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{tCart("vatIncluded")}</p>

          {notice === null ? null : (
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              data-testid="checkout-error"
            >
              {notice}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            full
            className="mt-6 hidden lg:inline-flex"
            disabled={!canSubmit || pending || quoting}
            data-testid="place-order-desktop"
          >
            <Lock aria-hidden="true" />
            {pending ? t("placing") : t("placeOrder")}
          </Button>
          {showReturnsLink ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t.rich("termsNote", {
                link: (chunks) => (
                  <Link href="/shipping-returns" className="underline underline-offset-2">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </div>
      </aside>

      {/* Mobile: the total and the button stay on screen. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{tCart("total")}</p>
            <p className="text-base font-semibold tabular-nums">
              {quote === null ? "…" : formatMoney(quote.totalPoisha, locale)}
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || pending || quoting}
            data-testid="place-order"
          >
            <Lock aria-hidden="true" />
            {pending ? t("placing") : t("placeOrder")}
          </Button>
        </div>
      </div>
    </form>
  );
}
