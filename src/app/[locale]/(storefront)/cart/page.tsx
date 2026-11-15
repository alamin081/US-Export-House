import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { readCartToken } from "@/modules/cart/cart-session";
import { getCartView } from "@/modules/cart/cart.service";
import { listZoneRates } from "@/modules/shipping/shipping.service";
import { CartView } from "./cart-view";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("cartTitle"), robots: { index: false, follow: false } };
}

/** Rendered per request: the cart is re-checked against prices and stock every time. */
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cart" });
  const [cart, zones] = await Promise.all([getCartView(await readCartToken()), listZoneRates()]);

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="mt-10">
        <CartView cart={cart} zones={zones} />
      </div>
    </div>
  );
}
