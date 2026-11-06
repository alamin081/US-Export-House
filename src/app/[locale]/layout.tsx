import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { clientEnv } from "@/config/env";
import { LOCALE_HREFLANG, routing, type Locale } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";

import "../globals.css";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Pre-render both locales at build time. */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Metadata" });
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: t("defaultTitle"),
      template: `%s · ${t("siteName")}`,
    },
    description: t("defaultDescription"),
    applicationName: t("siteName"),
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: {
        [LOCALE_HREFLANG.bn]: "/",
        [LOCALE_HREFLANG.en]: "/en",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("defaultTitle"),
      description: t("defaultDescription"),
      locale: LOCALE_HREFLANG[locale],
      url: locale === routing.defaultLocale ? baseUrl : `${baseUrl}/${locale}`,
    },
    robots: {
      // Nothing is public until launch; Phase 13 flips this on for production.
      index: false,
      follow: false,
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={LOCALE_HREFLANG[locale]} suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh bg-background text-foreground antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
