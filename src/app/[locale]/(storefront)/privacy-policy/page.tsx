import { getTranslations } from "next-intl/server";

import { PolicyPageView } from "@/components/shared/policy-page";
import { MOCK_PRIVACY_POLICY } from "@/modules/content/content.mock";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("privacyTitle") };
}

export default function PrivacyPolicyPage() {
  return <PolicyPageView page={MOCK_PRIVACY_POLICY} />;
}
