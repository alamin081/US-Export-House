import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { MOCK_ADDRESSES, MOCK_CUSTOMER, MOCK_ORDERS } from "@/modules/orders/orders.mock";
import { AccountTabs } from "./account-tabs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("accountTitle"), robots: { index: false, follow: false } };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("welcome", { name: MOCK_CUSTOMER.name })}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          {t("signOut")}
        </Button>
      </header>

      <p className="mt-6 rounded-md border border-dashed border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
        {t("loginNote")}
      </p>

      <div className="mt-10">
        <AccountTabs
          customer={{
            name: MOCK_CUSTOMER.name,
            phone: MOCK_CUSTOMER.phone,
            email: MOCK_CUSTOMER.email,
            memberSince: MOCK_CUSTOMER.memberSince,
          }}
          orders={MOCK_ORDERS}
          addresses={MOCK_ADDRESSES}
        />
      </div>
    </div>
  );
}
