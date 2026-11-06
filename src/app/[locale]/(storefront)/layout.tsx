import { useTranslations } from "next-intl";

import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";

/** Shell shared by every customer-facing page: header, main region, footer. */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Common");

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>

      <SiteHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
