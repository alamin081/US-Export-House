"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/shared/empty-state";
import { MediaImage } from "@/components/shared/media-image";
import { Price } from "@/components/shared/price";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import { countArgs } from "@/lib/number";
import { cn } from "@/lib/utils";
import {
  calculateTotals,
  MOCK_COUPONS,
  type MockCartLine,
  type ShippingZoneId,
} from "@/modules/cart/cart.mock";

/**
 * Cart screen.
 *
 * PHASE 3: lines live in React state only. Quantities, the delivery zone and
 * the coupon all recalculate the totals locally so the layout can be reviewed;
 * in Phase 8 every one of those numbers is recomputed on the server from the
 * database before an order is created.
 */
export function CartView({ initialLines }: { initialLines: readonly MockCartLine[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Cart");
  const [lines, setLines] = useState<MockCartLine[]>([...initialLines]);
  const [zone, setZone] = useState<ShippingZoneId>("inside_dhaka");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [couponError, setCouponError] = useState(false);

  const totals = useMemo(
    () => calculateTotals(lines, zone, appliedCoupon),
    [lines, zone, appliedCoupon],
  );

  function setQuantity(lineId: string, quantity: number) {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, quantity } : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  }

  function applyCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (code in MOCK_COUPONS) {
      setAppliedCoupon(code);
      setCouponError(false);
    } else {
      setAppliedCoupon(undefined);
      setCouponError(true);
    }
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={{ label: t("continueShopping"), href: "/shop" }}
      />
    );
  }

  const coupon = appliedCoupon === undefined ? undefined : MOCK_COUPONS[appliedCoupon];

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
      {/* Lines */}
      <section aria-label={t("itemsHeading", countArgs(totals.itemCount))}>
        <h2 className="text-sm text-muted-foreground">
          {t("itemsHeading", countArgs(totals.itemCount))}
        </h2>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {lines.map((line) => {
            const name = localize(line.name, locale);
            return (
              <li key={line.lineId} className="flex gap-4 py-6 sm:gap-6">
                <Link href={`/product/${line.productSlug}`} className="w-24 shrink-0 sm:w-28">
                  <MediaImage
                    src={line.image}
                    alt={name}
                    ratio="product"
                    className="rounded-md"
                    sizes="112px"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium">
                        <Link href={`/product/${line.productSlug}`} className="hover:underline">
                          {name}
                        </Link>
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {line.size} · {localize(line.colour, locale)} · {line.sku}
                      </p>
                    </div>
                    <Price
                      pricePoisha={line.unitPricePoisha * line.quantity}
                      {...(line.comparePricePoisha === undefined
                        ? {}
                        : { comparePricePoisha: line.comparePricePoisha * line.quantity })}
                      size="sm"
                    />
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-4">
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(next) => setQuantity(line.lineId, next)}
                      max={line.maxQuantity}
                      itemLabel={name}
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.lineId)}
                      aria-label={t("removeItem", { item: name })}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                      {t("remove")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <Link href="/shop" className="text-sm underline underline-offset-4">
            {t("continueShopping")}
          </Link>
        </div>
      </section>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">{t("orderSummary")}</h2>

          {/* Delivery zone */}
          <div className="mt-5">
            <Label htmlFor="cart-zone">{t("zoneLabel")}</Label>
            <Select
              id="cart-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value as ShippingZoneId)}
            >
              <option value="inside_dhaka">{t("insideDhaka")}</option>
              <option value="outside_dhaka">{t("outsideDhaka")}</option>
            </Select>
          </div>

          {/* Coupon */}
          <form onSubmit={applyCoupon} className="mt-5">
            <Label htmlFor="cart-coupon">{t("couponLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="cart-coupon"
                value={couponInput}
                placeholder={t("couponPlaceholder")}
                aria-invalid={couponError}
                aria-describedby={couponError ? "cart-coupon-error" : "cart-coupon-hint"}
                onChange={(event) => {
                  setCouponInput(event.target.value);
                  setCouponError(false);
                }}
              />
              <Button type="submit" variant="outline">
                {t("couponApply")}
              </Button>
            </div>
            {couponError ? (
              <FieldHint id="cart-coupon-error" tone="error">
                {t("couponInvalid")}
              </FieldHint>
            ) : coupon === undefined ? (
              <FieldHint id="cart-coupon-hint">{t("sampleCouponHint")}</FieldHint>
            ) : (
              <FieldHint id="cart-coupon-hint">
                {t("couponApplied", { label: localize(coupon.label, locale) })}
              </FieldHint>
            )}
          </form>

          {/* Totals */}
          <dl className="mt-6 flex flex-col gap-2.5 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("subtotal")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotalPoisha, locale)}</dd>
            </div>

            {totals.discountPoisha > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("discount")}</dt>
                <dd className="text-destructive tabular-nums">
                  −{formatMoney(totals.discountPoisha, locale)}
                </dd>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("shipping")}</dt>
              <dd className="tabular-nums">
                {totals.shippingPoisha === 0
                  ? t("shippingFree")
                  : formatMoney(totals.shippingPoisha, locale)}
              </dd>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-4 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums">{formatMoney(totals.totalPoisha, locale)}</dd>
            </div>
          </dl>

          {/* Free shipping progress */}
          <p className="mt-4 text-xs text-muted-foreground">
            {totals.freeShippingApplied
              ? t("freeShippingReached")
              : t("freeShippingProgress", {
                  amount: formatMoney(totals.remainingForFreeShippingPoisha, locale),
                })}
          </p>

          <Link href="/checkout" className={cn(buttonVariants({ size: "lg", full: true }), "mt-6")}>
            {t("proceedToCheckout")}
          </Link>

          <p className="mt-3 text-xs text-muted-foreground">{t("serverCalcNote")}</p>
        </div>

        <SampleContentNote className="mt-4" />
      </aside>
    </div>
  );
}
