import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { TrackOrderForm } from "./track-order-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("trackOrderTitle") };
}

export default async function TrackOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "TrackOrder" });

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />

      <header className="mt-6 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <div className="mt-10">
        <TrackOrderForm />
      </div>
    </div>
  );
}
