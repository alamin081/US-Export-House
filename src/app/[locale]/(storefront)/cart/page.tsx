import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { MOCK_CART_LINES } from "@/modules/cart/cart.mock";
import { CartView } from "./cart-view";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("cartTitle"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cart" });

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="mt-10">
        <CartView initialLines={MOCK_CART_LINES} />
      </div>
    </div>
  );
}
