"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ACCOUNT_NAV, MAIN_NAV } from "@/components/shared/navigation";
import { Link } from "@/i18n/navigation";

/**
 * Mobile navigation drawer.
 *
 * Hand-rolled rather than pulled from a dialog library: it needs a focus trap
 * no more complex than Escape-to-close plus a scroll lock, and this keeps the
 * bundle small on the phones most customers shop from.
 */
export function MobileNav() {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={tCommon("openMenu")}
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={tCommon("closeMenu")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/30"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tCommon("menu")}
            className="absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col bg-background shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="text-sm font-semibold tracking-[0.14em] uppercase">
                {tCommon("brandName")}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tCommon("closeMenu")}
                className="inline-flex size-9 items-center justify-center rounded-md hover:bg-secondary"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>

            <nav aria-label={tCommon("menu")} className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col">
                {MAIN_NAV.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block border-b border-border py-3 text-sm"
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="mt-6 flex flex-col gap-3">
                {ACCOUNT_NAV.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t border-border px-5 py-4">
              <LocaleSwitcher withIcon />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
