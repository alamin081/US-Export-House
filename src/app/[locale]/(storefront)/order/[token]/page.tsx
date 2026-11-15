import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { OrderDetails } from "@/components/shared/order-details";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getOrderConfirmation } from "@/modules/checkout/checkout.service";
import { getCheckoutSettings } from "@/modules/settings/settings.service";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "OrderView" });
  return { title: t("confirmedTitle"), robots: { index: false, follow: false } };
}

/**
 * Order confirmation. The URL token is unguessable, so only whoever placed
 * the order (or was sent the link) can open it; the phone is still masked.
 */
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "OrderView" });
  const [order, settings] = await Promise.all([getOrderConfirmation(token), getCheckoutSettings()]);
  if (order === null) notFound();

  return (
    <div className="site-container max-w-2xl py-10 lg:py-14">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 aria-hidden="true" className="size-12 text-success" />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("thanks")}</h1>
        <p className="text-sm text-muted-foreground">{t("orderNumberIs")}</p>
        <p className="text-xl font-semibold tracking-wide tabular-nums" data-testid="order-number">
          {order.orderNumber}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">{t("nextSteps")}</p>
        {settings.storeContactPhone === "" ? null : (
          <p className="text-sm">
            {t("questions")}{" "}
            <a href={`tel:${settings.storeContactPhone}`} className="font-medium underline">
              {settings.storeContactPhone}
            </a>
          </p>
        )}
      </div>

      <div className="mt-10 rounded-lg border border-border bg-card p-5 sm:p-6">
        <OrderDetails order={order} />
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/track-order" className={buttonVariants({ variant: "outline" })}>
          {t("trackLink")}
        </Link>
        <Link href="/shop" className={buttonVariants()}>
          {t("continueShopping")}
        </Link>
      </div>
    </div>
  );
}
