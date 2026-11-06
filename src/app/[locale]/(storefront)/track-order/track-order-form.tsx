"use client";

import { useState } from "react";
import { Check, Package, Search, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ErrorPanel } from "@/components/shared/empty-state";
import { MediaImage } from "@/components/shared/media-image";
import { Price } from "@/components/shared/price";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  findOrderForTracking,
  ORDER_PROGRESS,
  progressIndex,
  type MockOrder,
} from "@/modules/orders/orders.mock";

/**
 * Order tracking.
 *
 * PHASE 3: the lookup runs against the sample orders in `orders.mock.ts`.
 * Phase 9 replaces it with a service call, and Phase 11 adds the real courier
 * status feed (webhook plus hourly polling).
 */
export function TrackOrderForm() {
  const locale = useLocale() as Locale;
  const t = useTranslations("TrackOrder");
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<MockOrder | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = findOrderForTracking(orderNumber, phone);
    setResult(found);
    setNotFound(found === undefined);
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-16">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <Label htmlFor="orderNumber" required>
            {t("orderNumberLabel")}
          </Label>
          <Input
            id="orderNumber"
            value={orderNumber}
            placeholder={t("orderNumberPlaceholder")}
            autoComplete="off"
            onChange={(event) => {
              setOrderNumber(event.target.value);
              setNotFound(false);
            }}
          />
        </div>

        <div>
          <Label htmlFor="trackPhone" required>
            {t("phoneLabel")}
          </Label>
          <Input
            id="trackPhone"
            type="tel"
            inputMode="numeric"
            value={phone}
            placeholder={t("phonePlaceholder")}
            onChange={(event) => {
              setPhone(event.target.value);
              setNotFound(false);
            }}
          />
          <FieldHint>{t("sampleHint")}</FieldHint>
        </div>

        <Button type="submit" size="lg">
          <Search aria-hidden="true" />
          {t("submit")}
        </Button>
      </form>

      <div>
        {notFound ? (
          <ErrorPanel title={t("notFoundTitle")} description={t("notFoundBody")} />
        ) : null}

        {result === undefined ? null : <TrackingResult order={result} locale={locale} />}
      </div>
    </div>
  );
}

function TrackingResult({ order, locale }: { order: MockOrder; locale: Locale }) {
  const t = useTranslations("TrackOrder");
  const tOrders = useTranslations("Orders");
  const currentIndex = progressIndex(order.status);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-base font-semibold tabular-nums">
            {t("resultHeading", { orderNumber: order.orderNumber })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("placedOn", { date: formatDate(order.placedAt, locale) })} ·{" "}
            {t("fulfilledFrom", { location: order.fulfilledFrom })}
          </p>
        </div>
        <Badge variant={order.status === "DELIVERED" ? "success" : "solid"}>
          {tOrders(`status${order.status}`)}
        </Badge>
      </header>

      <div className="px-6 py-6">
        {/* Progress */}
        <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
          {ORDER_PROGRESS.map((step, index) => {
            const done = currentIndex >= index;
            const Icon = index === 2 ? Truck : index === 3 ? Check : Package;
            return (
              <li key={step} className="flex flex-1 gap-3 sm:flex-col sm:gap-2">
                <div className="flex items-center sm:w-full">
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-full border",
                      done
                        ? "border-foreground bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  {index < ORDER_PROGRESS.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mx-2 hidden h-px flex-1 sm:block",
                        currentIndex > index ? "bg-foreground" : "bg-border",
                      )}
                    />
                  ) : null}
                </div>
                <div className="pb-6 sm:pb-0">
                  <p className={cn("text-sm", done ? "font-medium" : "text-muted-foreground")}>
                    {tOrders(`status${step}`)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Courier */}
        {order.shipment === undefined ? null : (
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-border pt-6 text-sm">
            <p>
              <span className="text-muted-foreground">{t("courierLabel")}: </span>
              {order.shipment.courier}
            </p>
            <p>
              <span className="text-muted-foreground">{t("consignmentLabel")}: </span>
              <span className="tabular-nums">{order.shipment.consignmentId}</span>
            </p>
            {order.shipment.mode === "mock" ? (
              <Badge variant="outline" className="border-dashed">
                MOCK
              </Badge>
            ) : null}
          </div>
        )}

        {order.shipment?.mode === "mock" ? (
          <SampleContentNote messageKey="mockCourier" className="mt-4" />
        ) : null}

        {/* Timeline */}
        <h3 className="mt-8 text-sm font-semibold tracking-[0.18em] uppercase">
          {t("timelineHeading")}
        </h3>
        <ol className="mt-4 flex flex-col gap-4 border-s border-border ps-5">
          {[...order.timeline].reverse().map((event) => (
            <li key={event.at} className="relative">
              <span
                aria-hidden="true"
                className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-foreground"
              />
              <p className="text-sm">{localize(event.note, locale)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(event.at, locale)}
              </p>
            </li>
          ))}
        </ol>

        {/* Address + items */}
        <div className="mt-8 grid gap-8 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">
              {t("addressHeading")}
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              {order.address.fullName}
              <br />
              {localize(order.address.line1, locale)}, {localize(order.address.area, locale)}
              <br />
              {localize(order.address.city, locale)} {order.address.postcode}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">
              {t("itemsHeading")}
            </h3>
            <ul className="mt-3 flex flex-col gap-3">
              {order.items.map((item) => (
                <li key={item.sku + item.size} className="flex items-center gap-3">
                  <div className="w-12 shrink-0">
                    <MediaImage
                      src={item.image}
                      alt={localize(item.name, locale)}
                      ratio="product"
                      className="rounded-sm"
                      sizes="48px"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium">{localize(item.name, locale)}</p>
                    <p className="text-muted-foreground">
                      {item.size} · {item.quantity}
                    </p>
                  </div>
                  <Price pricePoisha={item.unitPricePoisha * item.quantity} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
