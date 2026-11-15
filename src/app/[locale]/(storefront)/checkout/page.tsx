import { randomUUID } from "node:crypto";

import { getTranslations } from "next-intl/server";

import { Link, redirect } from "@/i18n/navigation";
import { readCartToken } from "@/modules/cart/cart-session";
import { getCheckoutCart } from "@/modules/cart/cart.service";
import { getRequestMeta } from "@/modules/access/access.service";
import { newFormToken, quoteCheckout } from "@/modules/checkout/checkout.service";
import { isReturnPolicyPublished } from "@/modules/returns/returns.service";
import { listDivisions } from "@/modules/shipping/shipping.service";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("checkoutTitle"), robots: { index: false, follow: false } };
}

/**
 * Rendered per request. A cart with a problem (sold out, archived, over a
 * limit) goes back to the cart page, where the customer can fix it.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  const token = await readCartToken();
  const cart = await getCheckoutCart(token);
  if (!cart.view.canCheckout) redirect({ href: "/cart", locale });

  const [divisions, initial] = await Promise.all([
    listDivisions(),
    quoteCheckout(token, { area: null, couponCode: null }, await getRequestMeta()),
  ]);

  return (
    <div className="site-container pt-8 pb-32 lg:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          {t("backToCart")}
        </Link>
      </div>

      <div className="mt-8">
        <CheckoutForm
          lines={cart.view.lines}
          divisions={divisions}
          formToken={newFormToken()}
          idempotencyKey={randomUUID()}
          storePhone={cart.settings.storeContactPhone}
          // Linked only once the return policy is approved and published.
          showReturnsLink={await isReturnPolicyPublished()}
          initialQuote={initial.ok ? initial.quote : null}
        />
      </div>
    </div>
  );
}
