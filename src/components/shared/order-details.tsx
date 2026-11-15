import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface OrderDetailsData {
  orderNumber: string;
  status: string;
  placedAt: Date;
  confirmedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  couponCode: string | null;
  zoneName: string | null;
  shipDivisionName: string | null;
  shipDistrictName: string | null;
  shipUpazilaName: string | null;
  maskedPhone: string;
  items: Array<{
    productNameEn: string;
    productNameBn: string | null;
    sku: string;
    sizeLabelEn: string | null;
    sizeLabelBn: string | null;
    colourLabelEn: string | null;
    colourLabelBn: string | null;
    quantity: number;
    lineTotalPoisha: number;
  }>;
}

const STEPS = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"] as const;

/** Order status, items and totals: used by the confirmation page and tracking. */
export function OrderDetails({ order }: { order: OrderDetailsData }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("OrderView");
  const bn = locale === "bn";
  const reachedAt = {
    PENDING: order.placedAt,
    CONFIRMED: order.confirmedAt,
    SHIPPED: order.shippedAt,
    DELIVERED: order.deliveredAt,
  };
  const area = [order.shipUpazilaName, order.shipDistrictName, order.shipDivisionName]
    .filter((part) => part !== null)
    .join(", ");

  return (
    <div className="flex flex-col gap-8" data-testid="order-details" data-status={order.status}>
      <section aria-labelledby="order-progress">
        <h2 id="order-progress" className="text-sm font-semibold tracking-[0.18em] uppercase">
          {t("progress")}
        </h2>
        {order.status === "CANCELLED" ? (
          <p className="mt-4 text-sm text-destructive">{t("cancelled")}</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {STEPS.map((step) => {
              const at = reachedAt[step];
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full border",
                      at === null
                        ? "border-border text-muted-foreground"
                        : "border-success bg-success text-white",
                    )}
                  >
                    {at === null ? null : <Check aria-hidden="true" className="size-3.5" />}
                  </span>
                  <span className={at === null ? "text-muted-foreground" : "font-medium"}>
                    {t(`status_${step}`)}
                  </span>
                  {at === null ? null : (
                    <span className="ms-auto text-xs text-muted-foreground">
                      {formatDateTime(at, locale)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="order-items">
        <h2 id="order-items" className="text-sm font-semibold tracking-[0.18em] uppercase">
          {t("items")}
        </h2>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {order.items.map((item) => (
            <li key={item.sku} className="flex justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {bn ? (item.productNameBn ?? item.productNameEn) : item.productNameEn}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    bn ? (item.sizeLabelBn ?? item.sizeLabelEn) : item.sizeLabelEn,
                    bn ? (item.colourLabelBn ?? item.colourLabelEn) : item.colourLabelEn,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}{" "}
                  × {item.quantity}
                </p>
              </div>
              <span className="tabular-nums">{formatMoney(item.lineTotalPoisha, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("subtotal")}</dt>
            <dd className="tabular-nums">{formatMoney(order.subtotalPoisha, locale)}</dd>
          </div>
          {order.discountPoisha > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {t("discount")}
                {order.couponCode === null ? "" : ` (${order.couponCode})`}
              </dt>
              <dd className="text-destructive tabular-nums">
                −{formatMoney(order.discountPoisha, locale)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("shipping")}</dt>
            <dd className="tabular-nums">
              {order.shippingPoisha === 0 ? t("free") : formatMoney(order.shippingPoisha, locale)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
            <dt>{t("totalCod")}</dt>
            <dd className="tabular-nums" data-testid="order-total">
              {formatMoney(order.totalPoisha, locale)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{t("vatIncluded")}</p>
      </section>

      <section aria-labelledby="order-delivery" className="text-sm">
        <h2 id="order-delivery" className="text-sm font-semibold tracking-[0.18em] uppercase">
          {t("delivery")}
        </h2>
        <p className="mt-3">{area}</p>
        <p className="text-muted-foreground">{t("phone", { phone: order.maskedPhone })}</p>
      </section>
    </div>
  );
}
