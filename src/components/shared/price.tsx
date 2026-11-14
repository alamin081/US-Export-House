import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useNumerals } from "./use-numerals";

export interface PriceProps {
  /** Current price in poisha. */
  pricePoisha: number;
  /** Original price in poisha, shown struck through when higher. */
  comparePricePoisha?: number | null;
  /** Shows "From ৳…" when a product's variants have different prices. */
  from?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Price display. Digits follow the `storefront.numerals` setting. */
export function Price({
  pricePoisha,
  comparePricePoisha,
  from = false,
  size = "md",
  className,
}: PriceProps) {
  const locale = useLocale() as Locale;
  const numerals = useNumerals();
  const t = useTranslations("Product");
  const hasDiscount =
    comparePricePoisha !== undefined &&
    comparePricePoisha !== null &&
    comparePricePoisha > pricePoisha;
  const format = (poisha: number) => formatMoney(poisha, locale, { numerals });

  const sizeClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  }[size];

  return (
    <span className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold tabular-nums", sizeClass)} data-testid="price">
        {from ? t("fromPrice", { price: format(pricePoisha) }) : format(pricePoisha)}
      </span>
      {hasDiscount ? (
        <>
          <span
            className="text-sm text-muted-foreground tabular-nums line-through"
            data-testid="compare-price"
          >
            {format(comparePricePoisha)}
          </span>
          <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent-foreground">
            {t("saveBadge", {
              percent: String(
                Math.round(((comparePricePoisha - pricePoisha) / comparePricePoisha) * 100),
              ),
            })}
          </span>
          <span className="sr-only">
            {t("discountedFrom", { price: format(comparePricePoisha) })}
          </span>
        </>
      ) : null}
    </span>
  );
}
