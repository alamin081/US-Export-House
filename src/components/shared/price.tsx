import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface PriceProps {
  /** Current price in poisha. */
  pricePoisha: number;
  /** Original price in poisha, shown struck through when higher. */
  comparePricePoisha?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Price display. Latin digits in both languages, by business decision. */
export function Price({ pricePoisha, comparePricePoisha, size = "md", className }: PriceProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Product");
  const hasDiscount = comparePricePoisha !== undefined && comparePricePoisha > pricePoisha;

  const sizeClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  }[size];

  return (
    <span className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold tabular-nums", sizeClass)}>
        {formatMoney(pricePoisha, locale)}
      </span>
      {hasDiscount ? (
        <>
          <span className="text-sm text-muted-foreground tabular-nums line-through">
            {formatMoney(comparePricePoisha, locale)}
          </span>
          <span className="sr-only">
            {t("discountedFrom", { price: formatMoney(comparePricePoisha, locale) })}
          </span>
        </>
      ) : null}
    </span>
  );
}
