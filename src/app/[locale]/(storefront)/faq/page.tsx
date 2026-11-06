import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cn } from "@/lib/utils";
import { getFaqGroups, getFaqItems, type MockFaqItem } from "@/modules/content/content.mock";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("faqTitle") };
}

/** `Faq.groupOrders`, `Faq.groupShipping`, ... */
const GROUP_KEY: Record<MockFaqItem["group"], string> = {
  orders: "groupOrders",
  shipping: "groupShipping",
  returns: "groupReturns",
  products: "groupProducts",
};

export default function FaqPage() {
  const locale = useLocale() as Locale;
  const t = useTranslations("Faq");

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("title") }]} />

      <header className="mt-6 border-b border-border pb-8">
        <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[14rem_1fr] lg:gap-16">
        {/* In-page navigation */}
        <nav aria-label={t("title")} className="lg:sticky lg:top-28 lg:self-start">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col">
            {getFaqGroups().map((group) => (
              <li key={group}>
                <a
                  href={`#faq-${group}`}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                >
                  {t(GROUP_KEY[group])}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-12">
          {getFaqGroups().map((group) => (
            <section key={group} id={`faq-${group}`} aria-labelledby={`faq-${group}-heading`}>
              <h2
                id={`faq-${group}-heading`}
                className="text-sm font-semibold tracking-[0.18em] uppercase"
              >
                {t(GROUP_KEY[group])}
              </h2>

              {/* Native <details>: accessible, keyboard-friendly, no JavaScript. */}
              <ul className="mt-5 divide-y divide-border border-y border-border">
                {getFaqItems(group).map((item) => (
                  <li key={item.id}>
                    <details className="group py-4">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
                        {localize(item.question, locale)}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {localize(item.answer, locale)}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="rounded-lg border border-border bg-secondary/40 p-6">
            <h2 className="text-base font-semibold">{t("stillNeedHelpTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("stillNeedHelpBody")}</p>
            <Link
              href="/contact"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}
            >
              {t("contactCta")}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
