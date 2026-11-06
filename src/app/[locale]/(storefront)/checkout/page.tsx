import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { MOCK_CART_LINES } from "@/modules/cart/cart.mock";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("checkoutTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });

  return (
    <div className="site-container py-10 lg:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          {t("backToCart")}
        </Link>
      </div>

      <div className="mt-10">
        <CheckoutForm lines={MOCK_CART_LINES} />
      </div>
    </div>
  );
}
