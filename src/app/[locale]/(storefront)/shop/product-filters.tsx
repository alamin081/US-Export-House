import { SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getAllSizes, getCategories, SORT_OPTIONS } from "@/modules/catalog/catalog.mock";

export type PriceBucketId = "under-2000" | "2000-3000" | "over-3000";

export interface PriceBucket {
  id: PriceBucketId;
  minPoisha?: number;
  maxPoisha?: number;
}

/** Price buckets in poisha, chosen around the current catalogue prices. */
export const PRICE_BUCKETS: readonly PriceBucket[] = [
  { id: "under-2000", maxPoisha: 200_000 },
  { id: "2000-3000", minPoisha: 200_000, maxPoisha: 300_000 },
  { id: "over-3000", minPoisha: 300_000 },
];

export function getPriceBucket(id: string | undefined): PriceBucket | undefined {
  return PRICE_BUCKETS.find((bucket) => bucket.id === id);
}

export interface FilterState {
  category?: string;
  sizes: readonly string[];
  price?: string;
  sort: string;
  q?: string;
}

/**
 * Listing filters as a plain GET form.
 *
 * Deliberately server-rendered with an explicit "apply" button: the filters
 * work with JavaScript disabled, every state is a shareable URL, and the page
 * stays statically renderable.
 */
export function ProductFilters({
  state,
  /** When set, the category field is fixed (used on category pages). */
  lockedCategory,
}: {
  state: FilterState;
  lockedCategory?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Shop");
  const tCommon = useTranslations("Common");
  const action = getPathname({
    href: lockedCategory === undefined ? "/shop" : `/category/${lockedCategory}`,
    locale,
  });

  const sortLabels: Record<string, string> = {
    featured: t("sortFeatured"),
    newest: t("sortNewest"),
    "price-asc": t("sortPriceAsc"),
    "price-desc": t("sortPriceDesc"),
    rating: t("sortRating"),
  };

  const priceLabels: Record<PriceBucketId, string> = {
    "under-2000": t("priceUnder", { price: formatMoney(200_000, locale) }),
    "2000-3000": t("priceBetween", {
      from: formatMoney(200_000, locale),
      to: formatMoney(300_000, locale),
    }),
    "over-3000": t("priceOver", { price: formatMoney(300_000, locale) }),
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Keep an active search term when filters change. */}
      {state.q === undefined ? null : <input type="hidden" name="q" value={state.q} />}

      <div>
        <h2 className="flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          {t("filtersTitle")}
        </h2>
      </div>

      {lockedCategory === undefined ? (
        <fieldset>
          <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("categoryFilter")}
          </legend>
          <Select
            name="category"
            defaultValue={state.category ?? ""}
            aria-label={t("categoryFilter")}
          >
            <option value="">{t("allCategories")}</option>
            {getCategories().map((category) => (
              <option key={category.slug} value={category.slug}>
                {localize(category.name, locale)}
              </option>
            ))}
          </Select>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("sizeFilter")}
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2.5">
          {getAllSizes().map((size) => (
            <label key={size} className="flex items-center gap-2 text-sm">
              <Checkbox name="size" value={size} defaultChecked={state.sizes.includes(size)} />
              <span className="tabular-nums">{size}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("priceFilter")}
        </legend>
        <Select name="price" defaultValue={state.price ?? ""} aria-label={t("priceFilter")}>
          <option value="">{t("priceAny")}</option>
          {PRICE_BUCKETS.map((bucket) => (
            <option key={bucket.id} value={bucket.id}>
              {priceLabels[bucket.id]}
            </option>
          ))}
        </Select>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("sortLabel")}
        </legend>
        <Select name="sort" defaultValue={state.sort} aria-label={t("sortLabel")}>
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {sortLabels[option]}
            </option>
          ))}
        </Select>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm">
          {tCommon("apply")}
        </Button>
        {/* A link, not a submit button: clearing must drop the current values. */}
        <Link
          href={lockedCategory === undefined ? "/shop" : `/category/${lockedCategory}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          {t("clearFilters")}
        </Link>
      </div>
    </form>
  );
}
