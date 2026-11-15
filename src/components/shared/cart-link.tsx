"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { formatCount } from "@/lib/number";
import { CART_EVENT } from "./cart-events";

/**
 * Header cart button. The count is fetched after the page loads (and on every
 * navigation) so cached pages never depend on a visitor's cart.
 */
export function CartLink() {
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const [units, setUnits] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cart/summary", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { units?: number } | null) => {
        if (typeof body?.units === "number") setUnits(body.units);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    const onChange = (event: Event) => setUnits((event as CustomEvent<number>).detail);
    window.addEventListener(CART_EVENT, onChange);
    return () => window.removeEventListener(CART_EVENT, onChange);
  }, []);

  return (
    <Link
      href="/cart"
      aria-label={tCommon("cartWithCount", { countText: formatCount(units) })}
      data-testid="header-cart"
      data-units={units}
      className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary"
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      {units > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground tabular-nums">
          {units}
        </span>
      ) : null}
    </Link>
  );
}
