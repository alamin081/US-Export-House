import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { MediaImage } from "@/components/shared/media-image";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cn } from "@/lib/utils";
import {
  MOCK_ABOUT_SECTIONS,
  MOCK_BRAND_INTRO,
  MOCK_SHOWROOMS,
} from "@/modules/content/content.mock";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("aboutTitle") };
}

export default function AboutPage() {
  const locale = useLocale() as Locale;
  const t = useTranslations("About");

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("eyebrow") }]} />

      <header className="mt-6 grid gap-10 border-b border-border pb-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        <MediaImage
          src={MOCK_BRAND_INTRO.image}
          alt={t("title")}
          ratio="wide"
          className="rounded-lg"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </header>

      {/* Story sections */}
      <div className="prose-site mt-12">
        {MOCK_ABOUT_SECTIONS.map((section) => (
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

      {/* Stats */}
      <section className="mt-16 border-y border-border py-10">
        <h2 className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {t("statsHeading")}
        </h2>
        <dl className="mt-6 grid grid-cols-3 gap-6">
          {MOCK_BRAND_INTRO.stats.map((stat) => (
            <div key={stat.value}>
              <dd className="text-3xl font-semibold tabular-nums">{stat.value}</dd>
              <dt className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
                {localize(stat.label, locale)}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* Showrooms */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">{t("showroomsHeading")}</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MOCK_SHOWROOMS.map((showroom) => (
            <li key={showroom.id} className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-sm font-semibold">{localize(showroom.name, locale)}</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                {localize(showroom.address, locale)}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {localize(showroom.hours, locale)}
              </p>
              <a
                href={`tel:${showroom.phone}`}
                className="mt-3 inline-block text-sm tabular-nums underline underline-offset-4"
              >
                {showroom.phone}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="mt-16 rounded-lg bg-primary p-8 text-primary-foreground sm:p-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t("ctaTitle")}</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-primary-foreground/80">
          {t("ctaBody")}
        </p>
        <Link
          href="/contact"
          className={cn(buttonVariants({ variant: "accent", size: "lg" }), "mt-6")}
        >
          {t("ctaButton")}
        </Link>
      </section>
    </div>
  );
}
