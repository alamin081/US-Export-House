import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { MockPolicyPage } from "@/modules/content/content.mock";

/**
 * Renders a policy page (privacy, shipping and returns).
 *
 * A page whose status is `draft` gets a visible notice: per the master spec a
 * draft policy must never be presented as approved business policy.
 */
export function PolicyPageView({ page }: { page: MockPolicyPage }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Policy");

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: localize(page.title, locale) }]} />

      <header className="mt-6 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{localize(page.title, locale)}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {localize(page.summary, locale)}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("lastUpdated", { date: formatDate(page.lastUpdated, locale) })}
        </p>
      </header>

      {page.status === "draft" ? (
        <div
          role="note"
          className="mt-8 max-w-2xl rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
            {t("draftNoticeTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("draftNoticeBody")}</p>
        </div>
      ) : null}

      <div className="prose-site mt-10">
        {page.sections.map((section) => (
          <section key={section.heading.en}>
            <h2>{localize(section.heading, locale)}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.en}>{localize(paragraph, locale)}</p>
            ))}
            {section.bullets === undefined ? null : (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet.en}>{localize(bullet, locale)}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-12">
        <Link href="/faq" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("helpCta")}
        </Link>
      </div>
    </div>
  );
}
