import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { isPreviewing } from "@/modules/content/content.storefront";

/**
 * Shell shared by every customer-facing page: header, main region, footer.
 *
 * Pages are rebuilt at least every five minutes, so a banner or announcement
 * with a start or end time switches on and off within five minutes of it
 * (publishing refreshes immediately through cache tags).
 */
export const revalidate = 300;

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Common");
  const preview = await isPreviewing();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>

      {preview ? (
        <div
          className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-red-700 px-4 py-1.5 text-xs font-medium text-white"
          data-testid="preview-banner"
        >
          DRAFT PREVIEW — staff only, not what customers see.
          {/* A plain link: the exit route clears the preview cookie and comes back. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler */}
          <a href="/api/admin/preview/exit" className="underline underline-offset-2">
            Exit preview
          </a>
        </div>
      ) : null}

      <SiteHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
