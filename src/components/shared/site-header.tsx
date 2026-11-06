import { Search, ShoppingBag, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MobileNav } from "@/components/shared/mobile-nav";
import { MAIN_NAV } from "@/components/shared/navigation";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatCount } from "@/lib/number";
import { MOCK_CART_LINES } from "@/modules/cart/cart.mock";

/**
 * Storefront header: announcement bar, wordmark, primary navigation, search and
 * the cart. Sticky on scroll, collapsed to a drawer below `lg`.
 *
 * PLACEHOLDER: the wordmark is set in type until the logo arrives, and the cart
 * count comes from the Phase 3 mock cart.
 */
export function SiteHeader() {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as Locale;
  const itemCount = MOCK_CART_LINES.reduce((total, line) => total + line.quantity, 0);
  // A plain GET form needs the locale-prefixed path, which `Link` would add.
  const searchAction = getPathname({ href: "/shop", locale });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="site-container flex h-9 items-center justify-between gap-4 text-xs">
          <p className="truncate">{tCommon("announcement")}</p>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/track-order" className="hidden hover:underline sm:inline">
              {t("trackOrder")}
            </Link>
            <LocaleSwitcher tone="dark" />
          </div>
        </div>
      </div>

      {/* Main row */}
      <div className="site-container flex h-16 items-center gap-3 lg:h-20">
        <MobileNav />

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
            {MAIN_NAV.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  {t(item.key)}
                </Link>
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

          <Link
            href="/account"
            aria-label={t("account")}
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary"
          >
            <UserRound aria-hidden="true" className="size-5" />
          </Link>

          <Link
            href="/cart"
            aria-label={tCommon("cartWithCount", { countText: formatCount(itemCount) })}
            className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary"
          >
            <ShoppingBag aria-hidden="true" className="size-5" />
            {itemCount > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground tabular-nums">
                {itemCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
