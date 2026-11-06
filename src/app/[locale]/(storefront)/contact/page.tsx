import { Clock, MapPin, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { MOCK_SHOWROOMS } from "@/modules/content/content.mock";
import { ContactForm } from "./contact-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("contactTitle") };
}

export default function ContactPage() {
  const locale = useLocale() as Locale;
  const t = useTranslations("Contact");

  return (
    <div className="site-container py-10 lg:py-14">
      <Breadcrumbs items={[{ label: t("eyebrow") }]} />

      <header className="mt-6 border-b border-border pb-8">
        <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <section aria-labelledby="contact-form-heading">
          <h2
            id="contact-form-heading"
            className="text-sm font-semibold tracking-[0.18em] uppercase"
          >
            {t("formHeading")}
          </h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>

        <aside>
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">
            {t("showroomsHeading")}
          </h2>
          <ul className="mt-6 flex flex-col gap-5">
            {MOCK_SHOWROOMS.map((showroom) => (
              <li key={showroom.id} className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">{localize(showroom.name, locale)}</h3>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {localize(showroom.address, locale)}
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="sr-only">{t("hoursLabel")}: </span>
                    {localize(showroom.hours, locale)}
                  </span>
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <Phone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`tel:${showroom.phone}`}
                    aria-label={t("phoneCallLabel", { name: localize(showroom.name, locale) })}
                    className="tabular-nums underline underline-offset-4"
                  >
                    {showroom.phone}
                  </a>
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-6 rounded-lg border border-dashed border-border bg-secondary/60 p-4 text-xs text-muted-foreground">
            {t("mapPlaceholder")}
          </p>
        </aside>
      </div>
    </div>
  );
}
