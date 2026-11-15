import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { AnnouncementBar } from "@/components/content/announcement-bar";
import { CartLink } from "@/components/shared/cart-link";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MobileNav } from "@/components/shared/mobile-nav";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { loadHeader } from "@/modules/content/content.views";

/**
 * Storefront header: announcement bar, wordmark, primary navigation, search and
 * the cart. Sticky on scroll, collapsed to a drawer below `lg`.
 *
 * The announcements and the menu come from the content editor (Phase 12);
 * a menu that has not been published yet shows only "Shop all". Customer
 * accounts are hidden until Phase 12.5. The cart count is fetched in the
 * browser (CartLink), so the header stays cacheable.
 */
export async function SiteHeader() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: "Nav" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const { messages, items, hasMenu } = await loadHeader(locale);
  const nav = hasMenu ? items : [{ id: "shop", label: t("shop"), href: "/shop", children: [] }];
  // A plain GET form needs the locale-prefixed path, which `Link` would add.
  const searchAction = getPathname({ href: "/shop", locale });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <AnnouncementBar messages={messages}>
        <Link href="/track-order" className="hidden hover:underline sm:inline">
          {t("trackOrder")}
        </Link>
        <LocaleSwitcher tone="dark" />
      </AnnouncementBar>

      {/* Main row */}
      <div className="site-container flex h-16 items-center gap-3 lg:h-20">
        <MobileNav items={nav} />

        <Link
          href="/"
          className="flex flex-col leading-none lg:mr-8"
          aria-label={tCommon("brandName")}
        >
          <span className="text-sm font-semibold tracking-[0.2em] uppercase sm:text-base">
            {tCommon("brandShort")}
          </span>
          <span className="mt-1 hidden text-[0.625rem] tracking-[0.3em] text-muted-foreground uppercase sm:block">
            {tCommon("brandTagline")}
          </span>
        </Link>

        <nav aria-label={tCommon("menu")} className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-6">
            {nav.map((item) => (
              <li key={item.id} className="group relative">
                <Link
                  href={item.href}
                  className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
                {item.children.length === 0 ? null : (
                  <ul className="invisible absolute start-0 top-full z-50 min-w-48 rounded-md border border-border bg-background py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={child.href}
                          className="block px-4 py-2 text-sm text-foreground/80 hover:bg-secondary hover:text-foreground"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          {/* Search submits to the listing page, which filters on `q`. */}
          <form action={searchAction} className="hidden items-center md:flex">
            <label htmlFor="site-search" className="sr-only">
              {tCommon("searchLabel")}
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder={tCommon("searchPlaceholder")}
                className="h-10 w-44 rounded-md border border-input bg-card ps-9 pe-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:w-56"
              />
            </div>
          </form>

          <Link
            href="/shop"
            aria-label={tCommon("searchLabel")}
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary md:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>

          <CartLink />
        </div>
      </div>
    </header>
  );
}
