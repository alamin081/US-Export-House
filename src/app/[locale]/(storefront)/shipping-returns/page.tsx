import { getTranslations } from "next-intl/server";

import { PolicyPageView } from "@/components/shared/policy-page";
import { MOCK_SHIPPING_RETURN_POLICY } from "@/modules/content/content.mock";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("shippingReturnsTitle"),
    // The return policy is still a draft, so it stays out of search results
    // until the business approves it.
    robots: { index: false, follow: true },
  };
}

export default function ShippingReturnsPage() {
  return <PolicyPageView page={MOCK_SHIPPING_RETURN_POLICY} />;
}
