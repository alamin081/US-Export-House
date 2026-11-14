"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Price } from "@/components/shared/price";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useProductSelection } from "./product-selection";

export interface PanelOption {
  id: string;
  label: string;
  hex: string | null;
}

export interface PanelVariant {
  id: string;
  sku: string;
  sizeId: string | null;
  colourId: string | null;
  pricePoisha: number;
  comparePricePoisha: number | null;
}

type StockState = "in" | "few" | "out";

/**
 * Online stock per variant ("in" / "few" / "out", never a number), fetched
 * after the cached page loads so stock changes never rebuild the page. Until
 * it arrives (or if it fails) nothing is marked unavailable.
 */
function useStockStates(slug: string): Record<string, StockState> | null {
  const [states, setStates] = useState<Record<string, StockState> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // `no-store`: the browser must not reuse an older answer; the shared
    // (CDN) cache and the server cache keep this cheap.
    fetch(`/api/storefront/products/${encodeURIComponent(slug)}/availability`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { variants?: Record<string, StockState> } | null) => {
        if (body?.variants !== undefined) setStates(body.variants);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [slug]);
  return states;
}

/**
 * Colour and size selection. The price, compare-at price, SKU and stock state
 * follow the chosen combination; sold-out sizes and colours stay visible but
 * are struck through and cannot be picked. "Add to cart" stays disabled until
 * the cart exists (Phase 8).
 */
export function ProductPurchasePanel({
  sizes,
  colours,
  variants,
  slug,
}: {
  sizes: readonly PanelOption[];
  colours: readonly PanelOption[];
  variants: readonly PanelVariant[];
  slug: string;
}) {
  const t = useTranslations("Product");
  const { colourId, sizeId, setColourId, setSizeId } = useProductSelection();
  const stock = useStockStates(slug);
  const inStock = (variant: PanelVariant) => stock === null || stock[variant.id] !== "out";

  const matches = (variant: PanelVariant, colour: string | null, size: string | null) =>
    (colours.length === 0 || variant.colourId === colour) &&
    (sizes.length === 0 || variant.sizeId === size);

  const selected = variants.find((variant) => matches(variant, colourId, sizeId)) ?? null;
  const complete =
    (colours.length === 0 || colourId !== null) && (sizes.length === 0 || sizeId !== null);
  const sizeExists = (size: string) =>
    variants.some(
      (variant) =>
        variant.sizeId === size && (colours.length === 0 || variant.colourId === colourId),
    );
  const sizeAvailable = (size: string) =>
    variants.some(
      (variant) =>
        variant.sizeId === size &&
        (colours.length === 0 || variant.colourId === colourId) &&
        inStock(variant),
    );
  // A colour is sold out when none of its sizes has stock.
  const colourAvailable = (colour: string) =>
    variants.some((variant) => variant.colourId === colour && inStock(variant));
  const selectedState: StockState | null =
    selected === null || stock === null ? null : (stock[selected.id] ?? "out");

  // Once stock is known: move off a sold-out colour, and drop a sold-out size.
  useEffect(() => {
    if (stock === null) return;
    if (colourId !== null && !colourAvailable(colourId)) {
      const next = colours.find((colour) => colourAvailable(colour.id));
      if (next !== undefined) setColourId(next.id);
    }
    if (sizeId !== null && !sizeAvailable(sizeId)) setSizeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when stock or colour changes
  }, [stock, colourId]);

  const selectedColour = colours.find((colour) => colour.id === colourId);

  return (
    <div className="flex flex-col gap-6" data-testid="purchase-panel">
      {colours.length > 0 ? (
        <fieldset>
          <legend className="text-xs font-medium tracking-[0.18em] uppercase">
            {t("colourLabel")}
            {selectedColour === undefined ? null : (
              <span className="ms-2 font-normal tracking-normal text-muted-foreground normal-case">
                {selectedColour.label}
              </span>
            )}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {colours.map((option) => {
              const isActive = option.id === colourId;
              const available = colourAvailable(option.id);
              return (
                <label
                  key={option.id}
                  title={available ? option.label : `${option.label} — ${t("outOfStock")}`}
                  data-testid="colour-option"
                  data-sold-out={available ? undefined : "true"}
                  className={cn(
                    "relative cursor-pointer rounded-full p-0.5 transition-shadow",
                    isActive ? "ring-2 ring-foreground ring-offset-2" : "ring-1 ring-border",
                    !available && "cursor-not-allowed opacity-40",
                  )}
                >
                  <input
                    type="radio"
                    name="colour"
                    value={option.id}
                    checked={isActive}
                    disabled={!available}
                    onChange={() => setColourId(option.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="block size-7 rounded-full"
                    style={{ backgroundColor: option.hex ?? "var(--color-secondary)" }}
                  />
                  {available ? null : (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-0 h-px w-full -rotate-45 bg-foreground"
                    />
                  )}
                  <span className="sr-only">
                    {option.label}
                    {available ? "" : ` — ${t("outOfStock")}`}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {sizes.length > 0 ? (
        <fieldset>
          <legend className="text-xs font-medium tracking-[0.18em] uppercase">
            {t("sizeLabel")}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((option) => {
              const isActive = option.id === sizeId;
              const available = sizeAvailable(option.id);
              const soldOut = sizeExists(option.id) && !available;
              return (
                <label
                  key={option.id}
                  data-testid="size-option"
                  data-sold-out={soldOut ? "true" : undefined}
                  title={soldOut ? t("outOfStock") : undefined}
                  className={cn(
                    "cursor-pointer rounded-md border px-4 py-2.5 text-sm tabular-nums transition-colors",
                    isActive
                      ? "border-foreground bg-primary text-primary-foreground"
                      : "border-input hover:border-foreground",
                    !available && "cursor-not-allowed line-through opacity-40",
                  )}
                >
                  <input
                    type="radio"
                    name="size"
                    value={option.id}
                    checked={isActive}
                    disabled={!available}
                    onChange={() => setSizeId(option.id)}
                    className="sr-only"
                  />
                  {option.label}
                  {soldOut ? <span className="sr-only"> — {t("outOfStock")}</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2" aria-live="polite">
        {selected !== null ? (
          <>
            <Price
              pricePoisha={selected.pricePoisha}
              comparePricePoisha={selected.comparePricePoisha}
              size="lg"
            />
            {selectedState === null ? null : (
              <p
                className={cn(
                  "text-sm font-medium",
                  selectedState === "in" && "text-success",
                  selectedState === "few" && "text-accent-foreground",
                  selectedState === "out" && "text-destructive",
                )}
                data-testid="stock-state"
                data-state={selectedState}
              >
                {selectedState === "in"
                  ? t("inStock")
                  : selectedState === "few"
                    ? t("lowStock")
                    : t("outOfStock")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("selectedSku")}:{" "}
              <span className="tabular-nums" data-testid="selected-sku">
                {selected.sku}
              </span>
            </p>
          </>
        ) : complete ? (
          <FieldHint tone="error">{t("unavailableCombination")}</FieldHint>
        ) : (
          <FieldHint>
            {colours.length > 0 && colourId === null ? t("selectColour") : t("selectSize")}
          </FieldHint>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Placeholder: the cart arrives in Phase 8. */}
        <Button
          size="lg"
          disabled
          aria-disabled="true"
          className="sm:self-start"
          data-testid="add-to-cart"
        >
          <ShoppingBag aria-hidden="true" />
          {t("addToCart")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("orderingSoon")}</p>
      </div>
    </div>
  );
}
