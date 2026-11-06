import { MapPin, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { HELP_NAV, SHOP_NAV } from "@/components/shared/navigation";
import { NewsletterForm } from "@/components/shared/newsletter-form";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { MOCK_SHOWROOMS } from "@/modules/content/content.mock";

/**
 * Storefront footer: newsletter, shop and help links, showroom contacts and the
 * legal row. PLACEHOLDER addresses and phone numbers until the real ones arrive.
 */
export function SiteFooter() {
  const t = useTranslations("Nav");
  const tFooter = useTranslations("Footer");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as Locale;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border bg-secondary/40">
      <div className="site-container py-14">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
          {/* Brand + newsletter */}
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] uppercase">
              {tCommon("brandShort")}
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {tFooter("brandBlurb")}
            </p>
            <div className="mt-6">
              <NewsletterForm />
            </div>
          </div>

          {/* Shop */}
          <nav aria-label={tFooter("shopHeading")}>
            <h2 className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {tFooter("shopHeading")}
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {SHOP_NAV.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                  >
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Help */}
          <nav aria-label={tFooter("helpHeading")}>
            <h2 className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {tFooter("helpHeading")}
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {HELP_NAV.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                  >
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Showrooms */}
          <div>
            <h2 className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {tFooter("visitHeading")}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {MOCK_SHOWROOMS.map((showroom) => (
                <li key={showroom.id} className="text-sm">
                  <p className="font-medium">{localize(showroom.name, locale)}</p>
                  <p className="mt-1 flex items-start gap-1.5 text-muted-foreground">
                    <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    {localize(showroom.address, locale)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                    <a href={`tel:${showroom.phone}`} className="hover:text-foreground">
                      {showroom.phone}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="site-container flex flex-col gap-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{tFooter("copyright", { year: String(year), brand: tCommon("brandName") })}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{tFooter("paymentMethods")}</span>
            <LocaleSwitcher withIcon />
          </div>
        </div>
      </div>
    </footer>
  );
}
