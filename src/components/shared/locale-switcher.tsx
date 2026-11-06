"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Language switcher.
 *
 * Keeps the current pathname and swaps only the locale, so a customer reading a
 * product page in Bengali lands on the same product in English.
 */
export function LocaleSwitcher({
  className,
  tone = "light",
  withIcon = false,
}: {
  className?: string;
  /** `dark` is used on the charcoal announcement bar and footer. */
  tone?: "light" | "dark";
  withIcon?: boolean;
}) {
  const t = useTranslations("LocaleSwitcher");
  const activeLocale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === activeLocale) return;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div
      className={cn("inline-flex items-center gap-1 text-xs", isPending && "opacity-60", className)}
      role="group"
      aria-label={t("label")}
    >
      {withIcon ? <Globe aria-hidden="true" className="mr-1 size-3.5 opacity-70" /> : null}
      {routing.locales.map((locale, index) => {
        const isActive = locale === activeLocale;
        return (
          <span key={locale} className="inline-flex items-center">
            {index > 0 ? (
              <span aria-hidden="true" className="mx-1 opacity-40">
                /
              </span>
            ) : null}
            <button
              type="button"
              lang={locale}
              aria-current={isActive ? "true" : undefined}
              aria-label={t("switchTo", { locale: LOCALE_LABELS[locale] })}
              disabled={isPending}
              onClick={() => selectLocale(locale)}
              className={cn(
                "rounded-sm px-1 py-0.5 transition-opacity",
                isActive ? "font-semibold" : "opacity-70 hover:opacity-100",
                tone === "dark" && "text-primary-foreground",
              )}
            >
              {LOCALE_LABELS[locale]}
            </button>
          </span>
        );
      })}
    </div>
  );
}
