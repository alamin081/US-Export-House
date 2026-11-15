import { getTranslations } from "next-intl/server";

import { PolicyPageView } from "@/components/shared/policy-page";
import { MOCK_SHIPPING_RETURN_POLICY } from "@/modules/content/content.mock";
import { isReturnPolicyPublished } from "@/modules/returns/returns.service";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("shippingReturnsTitle"),
    // Out of search results until the policy is approved and published.
    robots: { index: await isReturnPolicyPublished(), follow: true },
  };
}

export default function ShippingReturnsPage() {
  return <PolicyPageView page={MOCK_SHIPPING_RETURN_POLICY} />;
}
