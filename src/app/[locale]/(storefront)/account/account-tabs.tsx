"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Price } from "@/components/shared/price";
import { SampleContentNote } from "@/components/shared/sample-content-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { MockAddress, MockOrder, OrderStatus } from "@/modules/orders/orders.mock";

type TabId = "profile" | "orders" | "addresses";

const STATUS_TONE: Record<OrderStatus, "solid" | "accent" | "muted" | "success" | "destructive"> = {
  PENDING: "muted",
  CONFIRMED: "accent",
  PROCESSING: "accent",
  SHIPPED: "solid",
  DELIVERED: "success",
  CANCELLED: "destructive",
  RETURNED: "muted",
};

export function AccountTabs({
  customer,
  orders,
  addresses,
}: {
  customer: { name: string; phone: string; email: string; memberSince: string };
  orders: readonly MockOrder[];
  addresses: readonly MockAddress[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Account");
  const tOrders = useTranslations("Orders");
  const [tab, setTab] = useState<TabId>("orders");

  const tabs: ReadonlyArray<{ id: TabId; label: string }> = [
    { id: "profile", label: t("tabProfile") },
    { id: "orders", label: t("tabOrders") },
    { id: "addresses", label: t("tabAddresses") },
  ];

  return (
    <div>
      {/* Tab list */}
      <div role="tablist" aria-label={t("title")} className="flex gap-1 border-b border-border">
        {tabs.map((item) => {
          const isActive = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm transition-colors",
                isActive
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Profile */}
      {tab === "profile" ? (
        <section role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" className="pt-8">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("profileHeading")}
          </h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:max-w-2xl">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{t("profileName")}</dt>
              <dd className="mt-1 text-sm font-medium">{customer.name}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{t("profilePhone")}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">{customer.phone}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{t("profileEmail")}</dt>
              <dd className="mt-1 text-sm font-medium">{customer.email}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{t("memberSinceLabel")}</dt>
              <dd className="mt-1 text-sm font-medium">
                {formatDate(customer.memberSince, locale)}
              </dd>
            </div>
          </dl>
          <Button variant="outline" size="sm" className="mt-6" disabled>
            {t("editProfile")}
          </Button>
        </section>
      ) : null}

      {/* Orders */}
      {tab === "orders" ? (
        <section role="tabpanel" id="panel-orders" aria-labelledby="tab-orders" className="pt-8">
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("ordersHeading")}
          </h2>
          <SampleContentNote messageKey="sampleOrders" className="mt-5 max-w-xl" />

          <ul className="mt-6 flex flex-col gap-4">
            {orders.map((order) => (
              <li key={order.orderNumber} className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{order.orderNumber}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("placedOn")}: {formatDate(order.placedAt, locale)} ·{" "}
                      {tOrders(`channel${order.channel}`)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_TONE[order.status]}>
                      {tOrders(`status${order.status}`)}
                    </Badge>
                    <Badge variant="outline">{tOrders(`payment${order.paymentStatus}`)}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {order.items.map((item) => (
                      <li key={item.sku + item.size}>
                        {localize(item.name, locale)} · {item.size} · {item.quantity}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-5">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t("orderTotal")}</p>
                      <Price pricePoisha={order.totalPoisha} size="sm" />
                    </div>
                    {order.shipment === undefined ? null : (
                      <Link href="/track-order" className="text-sm underline underline-offset-4">
                        {t("trackOrder")}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Addresses */}
      {tab === "addresses" ? (
        <section
          role="tabpanel"
          id="panel-addresses"
          aria-labelledby="tab-addresses"
          className="pt-8"
        >
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("addressesHeading")}
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
            {addresses.map((address) => (
              <li key={address.label.en} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{localize(address.label, locale)}</p>
                  {address.isDefault ? <Badge variant="muted">{t("defaultAddress")}</Badge> : null}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {address.fullName}
                  <br />
                  {localize(address.line1, locale)}, {localize(address.area, locale)}
                  <br />
                  {localize(address.city, locale)} {address.postcode}
                  <br />
                  <span className="tabular-nums">{address.phone}</span>
                </p>
                <div className="mt-4 flex gap-3">
                  <Button variant="outline" size="sm" disabled>
                    {t("editAddress")}
                  </Button>
                  <Button variant="ghost" size="sm" disabled>
                    {t("deleteAddress")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-6" disabled>
            {t("addAddress")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
