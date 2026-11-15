import { MapPin, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { loadFooter } from "@/modules/content/content.views";

/**
 * Storefront footer (Phase 12): the brand line and link columns from the
 * content editor, the shop's own contact details and social links from
 * Settings, and the real branches from Locations (active branches only).
 * Nothing here is invented: an empty setting is simply not shown.
 */
export async function SiteFooter() {
  const locale = (await getLocale()) as Locale;
  const tFooter = await getTranslations({ locale, namespace: "Footer" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const footer = await loadFooter(locale);
  const year = new Date().getFullYear();
  const brand = footer.store.name || tCommon("brandName");
  const heading = "text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase";

  return (
    <footer className="mt-24 border-t border-border bg-secondary/40" data-testid="site-footer">
      <div className="site-container py-14">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] uppercase">{brand}</p>
            {footer.blurb === "" ? null : (
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {footer.blurb}
              </p>
            )}
            <ul className="mt-5 flex flex-col gap-1.5 text-sm text-muted-foreground">
              {footer.store.address === "" ? null : (
                <li className="flex items-start gap-1.5">
                  <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {footer.store.address}
                </li>
              )}
              {footer.store.phone === "" ? null : (
                <li className="flex items-center gap-1.5">
                  <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                  <a
                    href={`tel:${footer.store.phone.replace(/\s/g, "")}`}
                    className="hover:text-foreground"
                  >
                    {footer.store.phone}
                  </a>
                </li>
              )}
            </ul>
            {footer.social.length === 0 ? null : (
              <ul
                className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm"
                aria-label={tFooter("socialHeading")}
              >
                {footer.social.map((entry) => (
                  <li key={entry.key}>
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                    >
                      {entry.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {footer.columns.map((column) => (
            <nav key={column.id} aria-label={column.title}>
              <h2 className={heading}>{column.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {footer.branches.length === 0 ? null : (
            <div>
              <h2 className={heading}>{tFooter("visitHeading")}</h2>
              <ul className="mt-4 flex flex-col gap-4" data-testid="footer-branches">
                {footer.branches.map((branch) => (
                  <li key={branch.id} className="text-sm">
                    <p className="font-medium">{branch.name}</p>
                    {branch.address === "" ? null : (
                      <p className="mt-1 flex items-start gap-1.5 text-muted-foreground">
                        <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        {branch.mapUrl === "" ? (
                          branch.address
                        ) : (
                          <a
                            href={branch.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground hover:underline"
                          >
                            {branch.address}
                          </a>
                        )}
                      </p>
                    )}
                    {branch.phone === "" ? null : (
                      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                        <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                        <a
                          href={`tel:${branch.phone.replace(/\s/g, "")}`}
                          className="hover:text-foreground"
                        >
                          {branch.phone}
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="site-container flex flex-col gap-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{tFooter("copyright", { year: String(year), brand })}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {footer.paymentMethods.length === 0 ? null : (
              <ul
                className="flex flex-wrap gap-3"
                aria-label={tFooter("paymentHeading")}
                data-testid="payment-methods"
              >
                {footer.paymentMethods.map((method) => (
                  <li key={method.key}>{method.label}</li>
                ))}
              </ul>
            )}
            <LocaleSwitcher withIcon />
          </div>
        </div>
      </div>
    </footer>
  );
}
