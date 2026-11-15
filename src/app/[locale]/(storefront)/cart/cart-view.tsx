"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { announceCartUnits } from "@/components/shared/cart-events";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaImage } from "@/components/shared/media-image";
import { Price } from "@/components/shared/price";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import { countArgs } from "@/lib/number";
import { cn } from "@/lib/utils";
import {
  acknowledgeCartPricesAction,
  removeFromCartAction,
  setCartQuantityAction,
  type CartActionResult,
} from "@/modules/cart/cart.actions";
import type { CartView as CartViewData, CartViewLine } from "@/modules/cart/cart.service";

interface ZoneRate {
  code: string;
  nameEn: string;
  nameBn: string | null;
  ratePoisha: number;
}

/**
 * Cart screen. Every number comes from the server, which re-read prices and
 * the default online location's stock for this request; each change goes
 * through a Server Action and the page is refreshed from the server.
 */
export function CartView({ cart, zones }: { cart: CartViewData; zones: readonly ZoneRate[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Cart");
  const tErrors = useTranslations("CartErrors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{
    variantId: string;
    result: Extract<CartActionResult, { ok: false }>;
  } | null>(null);

  function change(variantId: string, action: () => Promise<CartActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) announceCartUnits(result.units);
      else setError({ variantId, result });
      router.refresh();
    });
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={{ label: t("continueShopping"), href: "/shop" }}
      />
    );
  }

  const priceChanged = cart.lines.some((line) => line.priceChange !== null);
  const progress = Math.min(
    100,
    Math.round(
      ((cart.freeShippingThresholdPoisha - cart.toFreeShippingPoisha) /
        Math.max(1, cart.freeShippingThresholdPoisha)) *
        100,
    ),
  );

  function problemText(line: CartViewLine): string | null {
    switch (line.problem) {
      case "UNAVAILABLE":
        return t("lineUnavailable");
      case "OUT_OF_STOCK":
        return t("lineOutOfStock");
      case "LOW_STOCK":
        return t("lineLowStock", { count: line.suggestedQuantity ?? 0 });
      case "OVER_LIMIT":
        return t("lineOverLimit", { max: line.suggestedQuantity ?? 0 });
      default:
        return null;
    }
  }

  return (
    <div
      className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16"
      aria-busy={pending}
      data-testid="cart"
    >
      <section aria-label={t("itemsHeading", countArgs(cart.units))}>
        <h2 className="text-sm text-muted-foreground">
          {t("itemsHeading", countArgs(cart.units))}
        </h2>

        {priceChanged ? (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent bg-accent/30 px-4 py-3 text-sm"
            role="status"
            data-testid="price-changed"
          >
            <span>{t("pricesChanged")}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  await acknowledgeCartPricesAction();
                  router.refresh();
                })
              }
            >
              {t("pricesChangedOk")}
            </Button>
          </div>
        ) : null}

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {cart.lines.map((line) => {
            const name = localize(line.name, locale);
            const options = [line.size, line.colour]
              .filter((option) => option !== null)
              .map((option) => localize(option, locale));
            const problem = problemText(line);
            return (
              <li
                key={line.variantId}
                className="flex gap-4 py-6 sm:gap-6"
                data-testid="cart-line"
                data-sku={line.sku}
                data-problem={line.problem ?? undefined}
              >
                <Link href={`/product/${line.productSlug}`} className="w-20 shrink-0 sm:w-28">
                  {line.imageUrl === null ? (
                    <div className="aspect-[4/5] rounded-md bg-secondary" />
                  ) : (
                    <MediaImage
                      src={line.imageUrl}
                      alt={name}
                      ratio="product"
                      className="rounded-md"
                      sizes="112px"
                    />
                  )}
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
                        {[...options, line.sku].join(" · ")}
                      </p>
                    </div>
                    <Price
                      pricePoisha={line.lineTotalPoisha}
                      {...(line.compareAtPoisha === null
                        ? {}
                        : { comparePricePoisha: line.compareAtPoisha * line.quantity })}
                      size="sm"
                    />
                  </div>

                  {line.priceChange === null ? null : (
                    <p className="text-xs text-accent-foreground">
                      {t("linePriceChanged", {
                        from: formatMoney(line.priceChange.fromPoisha, locale),
                        to: formatMoney(line.priceChange.toPoisha, locale),
                      })}
                    </p>
                  )}

                  {problem === null ? null : (
                    <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
                      <AlertTriangle aria-hidden="true" className="size-3.5" />
                      {problem}
                      {line.problem === "LOW_STOCK" || line.problem === "OVER_LIMIT" ? (
                        <button
                          type="button"
                          className="ms-1 underline underline-offset-2"
                          onClick={() =>
                            change(line.variantId, () =>
                              setCartQuantityAction({
                                variantId: line.variantId,
                                quantity: line.suggestedQuantity ?? 0,
                              }),
                            )
                          }
                        >
                          {t("useSuggested", { count: line.suggestedQuantity ?? 0 })}
                        </button>
                      ) : null}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-4">
                    {line.problem === "UNAVAILABLE" || line.problem === "OUT_OF_STOCK" ? null : (
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(next) =>
                          change(line.variantId, () =>
                            setCartQuantityAction({ variantId: line.variantId, quantity: next }),
                          )
                        }
                        max={Math.max(line.maxQuantity, 1)}
                        itemLabel={name}
                        size="sm"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        change(line.variantId, () =>
                          removeFromCartAction({ variantId: line.variantId, quantity: 0 }),
                        )
                      }
                      aria-label={t("removeItem", { item: name })}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                      {t("remove")}
                    </button>
                  </div>

                  {error?.variantId === line.variantId ? (
                    <FieldHint tone="error">
                      {tErrors(error.result.refusal, {
                        count: error.result.available ?? 0,
                        max: error.result.max ?? 0,
                      })}
                    </FieldHint>
                  ) : null}
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

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">{t("orderSummary")}</h2>

          <dl className="mt-5 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("subtotal")}</dt>
              <dd className="tabular-nums" data-testid="cart-subtotal">
                {formatMoney(cart.subtotalPoisha, locale)}
              </dd>
            </div>
          </dl>

          {/* Free delivery progress (before any coupon). */}
          <div className="mt-5">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={t("freeShippingBar")}
            >
              <div className="h-full bg-success" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground" data-testid="free-shipping-note">
              {cart.toFreeShippingPoisha === 0
                ? t("freeShippingReached")
                : t("freeShippingProgress", {
                    amount: formatMoney(cart.toFreeShippingPoisha, locale),
                  })}
            </p>
          </div>

          {/* Estimated delivery: the zone follows from the address at checkout. */}
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium">{t("estimatedDelivery")}</p>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              {zones.map((zone) => (
                <li key={zone.code} className="flex justify-between gap-4">
                  <span>{locale === "bn" ? (zone.nameBn ?? zone.nameEn) : zone.nameEn}</span>
                  <span className="tabular-nums">
                    {cart.toFreeShippingPoisha === 0
                      ? t("shippingFree")
                      : formatMoney(zone.ratePoisha, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {cart.overItemLimit ? (
            <FieldHint tone="error" className="mt-4">
              {tErrors("PER_ORDER", { max: cart.maxItemsPerOrder, count: 0 })}
            </FieldHint>
          ) : null}

          {cart.canCheckout ? (
            <Link
              href="/checkout"
              className={cn(buttonVariants({ size: "lg", full: true }), "mt-6")}
              data-testid="proceed-to-checkout"
            >
              {t("proceedToCheckout")}
            </Link>
          ) : (
            <Button size="lg" full disabled className="mt-6" data-testid="proceed-to-checkout">
              {t("proceedToCheckout")}
            </Button>
          )}
          {cart.canCheckout ? null : (
            <p className="mt-2 text-xs text-destructive">{t("fixLinesFirst")}</p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">{t("vatIncluded")}</p>
        </div>
      </aside>
    </div>
  );
}
