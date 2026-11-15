"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { OrderDetails, type OrderDetailsData } from "@/components/shared/order-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { trackOrderAction } from "@/modules/checkout/checkout.actions";

/**
 * Order tracking: the order number plus the mobile number it was placed
 * with. Every miss gets the same message, and tries are rate-limited.
 */
export function TrackOrderForm() {
  const t = useTranslations("TrackOrder");
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<OrderDetailsData | null>(null);
  const [error, setError] = useState<"NOT_FOUND" | "RATE_LIMITED" | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await trackOrderAction({ orderNumber, phone });
      if (result.ok) {
        setOrder(result.order);
      } else {
        setOrder(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-16">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="track-form">
        <div>
          <Label htmlFor="orderNumber" required>
            {t("orderNumberLabel")}
          </Label>
          <Input
            id="orderNumber"
            value={orderNumber}
            placeholder={t("orderNumberPlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(event) => setOrderNumber(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="trackPhone" required>
            {t("phoneLabel")}
          </Label>
          <Input
            id="trackPhone"
            type="tel"
            inputMode="tel"
            value={phone}
            placeholder={t("phonePlaceholder")}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={pending || orderNumber.trim() === "" || phone.trim() === ""}
        >
          <Search aria-hidden="true" />
          {t("submit")}
        </Button>
        {error === null ? null : (
          <FieldHint tone="error" role="alert" data-testid="track-error">
            {error === "RATE_LIMITED" ? t("rateLimited") : t("notFoundBody")}
          </FieldHint>
        )}
      </form>

      <div aria-live="polite">
        {order === null ? null : (
          <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold" data-testid="track-order-number">
              {t("resultHeading", { orderNumber: order.orderNumber })}
            </h2>
            <div className="mt-6">
              <OrderDetails order={order} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
