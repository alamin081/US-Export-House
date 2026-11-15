import { ChevronDown, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/datetime";
import { plainText } from "@/modules/content/inline";
import { pagePath, type PageContent } from "@/modules/content/content.schema";
import {
  cachedBranches,
  cachedContentSettings,
  cachedLivePages,
  loadPage,
} from "@/modules/content/content.storefront";
import { fillPlaceholders, type PlaceholderValues } from "@/modules/content/placeholders";
import { ContentBlocks } from "./content-blocks";
import { filledText, localText, RichText } from "./rich-text";

/**
 * Every content page (About, Contact, FAQ, policies, size guide, and pages
 * staff create) is one document from the editor, rendered here. A page that
 * is not published is a 404 — except for staff previewing a draft.
 */

function toLocale(raw: string): Locale {
  return raw === "bn" ? "bn" : "en";
}

export function contentPageMetadata(slug: string) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> {
    const locale = toLocale((await params).locale);
    const [page, settings] = await Promise.all([loadPage(slug), cachedContentSettings()]);
    if (page === null) return {};
    const values = settings.placeholders;
    const title =
      filledText(page.seoTitle, locale, values) || filledText(page.title, locale, values);
    const description = plainText(
      filledText(page.seoDescription, locale, values) || filledText(page.summary, locale, values),
    );
    const path = pagePath(slug);
    const image = page.ogImage?.url ?? (settings.site.defaultOgImageUrl || null);
    return {
      title,
      ...(description === "" ? {} : { description }),
      alternates: {
        canonical: locale === "bn" ? path : `/en${path}`,
        languages: { "bn-BD": path, "en-BD": `/en${path}`, "x-default": path },
      },
      openGraph: {
        title,
        ...(description === "" ? {} : { description }),
        ...(image === null ? {} : { images: [{ url: image }] }),
      },
    };
  };
}

function FaqList({
  page,
  locale,
  values,
}: {
  page: PageContent;
  locale: Locale;
  values: PlaceholderValues;
}) {
  return (
    <div className="mt-10 flex flex-col gap-10" data-testid="faq-groups">
      {page.faq.map((group) => (
        <section key={group.id} id={`faq-${group.id}`} aria-labelledby={`faq-title-${group.id}`}>
          <h2 id={`faq-title-${group.id}`} className="text-lg font-semibold">
            {localText(group.title, locale)}
          </h2>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {group.items.map((item) => (
              <details key={item.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                  <RichText text={item.question} locale={locale} values={values} />
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  <RichText text={item.answer} locale={locale} values={values} />
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** FAQPage structured data. JSON is escaped so it cannot close the script tag. */
function FaqJsonLd({
  page,
  locale,
  values,
}: {
  page: PageContent;
  locale: Locale;
  values: PlaceholderValues;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: plainText(fillPlaceholders(localText(item.question, locale), values, locale)),
        acceptedAnswer: {
          "@type": "Answer",
          text: plainText(fillPlaceholders(localText(item.answer, locale), values, locale)),
        },
      })),
    ),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // Escaped JSON only (see above), never editor text as HTML.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

async function ContactDetails({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Contact" });
  const [settings, branches] = await Promise.all([cachedContentSettings(), cachedBranches()]);
  const phone = settings.placeholders.storePhone;
  const whatsapp = settings.store.whatsapp.replace(/\D/g, "");
  return (
    <div className="mt-10 flex flex-col gap-8" data-testid="contact-details">
      {phone === "" && whatsapp === "" ? null : (
        <div className="flex flex-wrap gap-3">
          {phone === "" ? null : (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              <Phone aria-hidden="true" className="size-4" />
              {phone}
            </a>
          )}
          {whatsapp === "" ? null : (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary"
              data-testid="whatsapp-link"
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              {t("whatsapp")}
            </a>
          )}
        </div>
      )}
      {branches.length === 0 ? null : (
        <section aria-labelledby="branches-title">
          <h2 id="branches-title" className="text-lg font-semibold">
            {t("branchesTitle")}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {branches.map((branch) => {
              const name = locale === "bn" && branch.nameBn ? branch.nameBn : branch.nameEn;
              const address =
                locale === "bn" && branch.addressBn ? branch.addressBn : branch.addressEn;
              const hours = locale === "bn" && branch.hoursBn ? branch.hoursBn : branch.hoursEn;
              return (
                <li key={branch.id} className="rounded-lg border border-border p-5 text-sm">
                  <p className="font-medium">{name}</p>
                  {address === null || address === "" ? null : (
                    <p className="mt-2 flex items-start gap-2 text-muted-foreground">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      {address}
                    </p>
                  )}
                  {branch.phone === null || branch.phone === "" ? null : (
                    <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <Phone aria-hidden="true" className="size-4 shrink-0" />
                      <a
                        href={`tel:${branch.phone.replace(/\s/g, "")}`}
                        className="hover:text-foreground"
                      >
                        {branch.phone}
                      </a>
                    </p>
                  )}
                  {hours === null || hours === "" ? null : (
                    <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <Clock aria-hidden="true" className="size-4 shrink-0" />
                      {hours}
                    </p>
                  )}
                  {branch.mapUrl === null || branch.mapUrl === "" ? null : (
                    <a
                      href={branch.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm underline underline-offset-4"
                    >
                      {t("openMap")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export async function ContentPageView({
  slug,
  params,
}: {
  slug: string;
  params: Promise<{ locale: string }>;
}) {
  const locale = toLocale((await params).locale);
  const [page, settings, live] = await Promise.all([
    loadPage(slug),
    cachedContentSettings(),
    cachedLivePages(),
  ]);
  if (page === null) notFound();
  const t = await getTranslations({ locale, namespace: "Policy" });
  const values = settings.placeholders;
  const title = filledText(page.title, locale, values);
  const summary = localText(page.summary, locale);
  const publishedAt = live.find((entry) => entry.slug === slug)?.publishedAt ?? null;

  return (
    <div className="site-container py-10 lg:py-14" data-testid={`content-page-${slug}`}>
      <Breadcrumbs items={[{ label: title }]} />
      <header className="mt-6 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {summary === "" ? null : (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            <RichText text={page.summary} locale={locale} values={values} />
          </p>
        )}
        {publishedAt === null ? null : (
          <p className="mt-4 text-xs text-muted-foreground">
            {t("lastUpdated", { date: formatDate(publishedAt, locale) })}
          </p>
        )}
      </header>

      {page.blocks.length === 0 ? null : (
        <div className="prose-site mt-10">
          <ContentBlocks blocks={page.blocks} locale={locale} values={values} />
        </div>
      )}

      {page.layout === "faq" && page.faq.length > 0 ? (
        <>
          <FaqList page={page} locale={locale} values={values} />
          <FaqJsonLd page={page} locale={locale} values={values} />
        </>
      ) : null}

      {page.layout === "contact" ? <ContactDetails locale={locale} /> : null}
    </div>
  );
}
