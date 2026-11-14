import { SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cn } from "@/lib/utils";
import {
  STOREFRONT_SORTS,
  type ListingFacets,
  type StorefrontCategory,
  type StorefrontSort,
} from "@/modules/catalog/storefront-catalog.service";

export interface FilterState {
  category?: string;
  sizes: readonly string[];
  colours: readonly string[];
  brands: readonly string[];
  min?: number;
  max?: number;
  sort: StorefrontSort;
  q?: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length <= 60).slice(0, 20);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function amount(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : undefined;
}

/** Reads the filter state from the URL, ignoring anything malformed. */
export function filterStateFrom(query: SearchParams): FilterState & { page: number } {
  const sort = first(query.sort);
  const q = first(query.q)?.trim().slice(0, 80);
  const category = first(query.category);
  const min = amount(first(query.min));
  const max = amount(first(query.max));
  const page = Number(first(query.page) ?? "1");
  return {
    ...(category === undefined || category === "" ? {} : { category }),
    sizes: all(query.size),
    colours: all(query.colour),
    brands: all(query.brand),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    sort: (STOREFRONT_SORTS as readonly string[]).includes(sort ?? "")
      ? (sort as StorefrontSort)
      : "featured",
    ...(q === undefined || q === "" ? {} : { q }),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The same state as URL search params, for pagination links. */
export function filterQuery(state: FilterState, page?: number): Record<string, string | string[]> {
  return {
    ...(state.category === undefined ? {} : { category: state.category }),
    ...(state.sizes.length === 0 ? {} : { size: [...state.sizes] }),
    ...(state.colours.length === 0 ? {} : { colour: [...state.colours] }),
    ...(state.brands.length === 0 ? {} : { brand: [...state.brands] }),
    ...(state.min === undefined ? {} : { min: String(state.min) }),
    ...(state.max === undefined ? {} : { max: String(state.max) }),
    ...(state.sort === "featured" ? {} : { sort: state.sort }),
    ...(state.q === undefined ? {} : { q: state.q }),
    ...(page === undefined || page <= 1 ? {} : { page: String(page) }),
  };
}

/**
 * Listing filters as a plain GET form: every state is a shareable URL and the
 * filters work with JavaScript disabled.
 */
export function ProductFilters({
  state,
  facets,
  categories,
  lockedCategory,
}: {
  state: FilterState;
  facets: ListingFacets;
  /** Top-level choices for the shop page; omitted on category pages. */
  categories?: readonly StorefrontCategory[];
  lockedCategory?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Shop");
  const tCommon = useTranslations("Common");
  const basePath = lockedCategory === undefined ? "/shop" : `/category/${lockedCategory}`;
  const action = getPathname({ href: basePath, locale });

  const sortLabels: Record<StorefrontSort, string> = {
    featured: t("sortFeatured"),
    newest: t("sortNewest"),
    "price-asc": t("sortPriceAsc"),
    "price-desc": t("sortPriceDesc"),
  };

  const legend = "mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase";

  return (
    <form action={action} className="flex flex-col gap-6" data-testid="product-filters">
      {state.q === undefined ? null : <input type="hidden" name="q" value={state.q} />}

      <h2 className="flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
        <SlidersHorizontal aria-hidden="true" className="size-3.5" />
        {t("filtersTitle")}
      </h2>

      {categories === undefined ? null : (
        <fieldset>
          <legend className={legend}>{t("categoryFilter")}</legend>
          <Select
            name="category"
            defaultValue={state.category ?? ""}
            aria-label={t("categoryFilter")}
          >
            <option value="">{t("allCategories")}</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {localize(category.name, locale)}
              </option>
            ))}
          </Select>
        </fieldset>
      )}

      {facets.sizes.length === 0 ? null : (
        <fieldset>
          <legend className={legend}>{t("sizeFilter")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2.5">
            {facets.sizes.map((size) => (
              <label key={size.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="size"
                  value={size.value}
                  defaultChecked={state.sizes.includes(size.value)}
                />
                <span className="tabular-nums">{localize(size.label, locale)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {facets.colours.length === 0 ? null : (
        <fieldset>
          <legend className={legend}>{t("colourFilter")}</legend>
          <div className="flex flex-col gap-2.5">
            {facets.colours.map((colour) => (
              <label key={colour.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="colour"
                  value={colour.value}
                  defaultChecked={state.colours.includes(colour.value)}
                />
                {colour.hex === null ? null : (
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: colour.hex }}
                  />
                )}
                {localize(colour.label, locale)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {facets.brands.length <= 1 ? null : (
        <fieldset>
          <legend className={legend}>{t("brandFilter")}</legend>
          <div className="flex flex-col gap-2.5">
            {facets.brands.map((brand) => (
              <label key={brand.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="brand"
                  value={brand.value}
                  defaultChecked={state.brands.includes(brand.value)}
                />
                {localize(brand.label, locale)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className={legend}>{t("priceFilter")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            name="min"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={state.min ?? ""}
            aria-label={t("priceMin")}
            placeholder={t("priceMin")}
          />
          <Input
            name="max"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={state.max ?? ""}
            aria-label={t("priceMax")}
            placeholder={t("priceMax")}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>{t("sortLabel")}</legend>
        <Select name="sort" defaultValue={state.sort} aria-label={t("sortLabel")}>
          {STOREFRONT_SORTS.map((option) => (
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
        <Link href={basePath} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          {t("clearFilters")}
        </Link>
      </div>
    </form>
  );
}

/** Previous / next links that keep every filter in the URL. */
export function ListingPagination({
  state,
  page,
  pageCount,
  basePath,
}: {
  state: FilterState;
  page: number;
  pageCount: number;
  basePath: string;
}) {
  const t = useTranslations("Shop");
  if (pageCount <= 1) return null;
  const link = (target: number) => ({ pathname: basePath, query: filterQuery(state, target) });

  return (
    <nav
      aria-label={t("pageStatus", { page: String(page), pages: String(pageCount) })}
      className="mt-12 flex items-center justify-between gap-4 border-t border-border pt-6 text-sm"
    >
      {page > 1 ? (
        <Link
          href={link(page - 1)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          rel="prev"
        >
          {t("previousPage")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground tabular-nums">
        {t("pageStatus", { page: String(page), pages: String(pageCount) })}
      </span>
      {page < pageCount ? (
        <Link
          href={link(page + 1)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          rel="next"
        >
          {t("nextPage")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
