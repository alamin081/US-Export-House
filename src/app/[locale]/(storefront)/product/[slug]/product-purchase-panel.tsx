"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";

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

/**
 * Colour and size selection. The price, compare-at price and SKU follow the
 * chosen combination. "Add to cart" stays disabled until the cart exists
 * (Phase 8); stock is not shown until Phase 7.
 */
export function ProductPurchasePanel({
  sizes,
  colours,
  variants,
}: {
  sizes: readonly PanelOption[];
  colours: readonly PanelOption[];
  variants: readonly PanelVariant[];
}) {
  const t = useTranslations("Product");
  const { colourId, sizeId, setColourId, setSizeId } = useProductSelection();

  const matches = (variant: PanelVariant, colour: string | null, size: string | null) =>
    (colours.length === 0 || variant.colourId === colour) &&
    (sizes.length === 0 || variant.sizeId === size);

  const selected = variants.find((variant) => matches(variant, colourId, sizeId)) ?? null;
  const complete =
    (colours.length === 0 || colourId !== null) && (sizes.length === 0 || sizeId !== null);
  const sizeAvailable = (size: string) =>
    variants.some(
      (variant) =>
        variant.sizeId === size && (colours.length === 0 || variant.colourId === colourId),
    );

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
              return (
                <label
                  key={option.id}
                  title={option.label}
                  className={cn(
                    "cursor-pointer rounded-full p-0.5 transition-shadow",
                    isActive ? "ring-2 ring-foreground ring-offset-2" : "ring-1 ring-border",
                  )}
                >
                  <input
                    type="radio"
                    name="colour"
                    value={option.id}
                    checked={isActive}
                    onChange={() => setColourId(option.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="block size-7 rounded-full"
                    style={{ backgroundColor: option.hex ?? "var(--color-secondary)" }}
                  />
                  <span className="sr-only">{option.label}</span>
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
              return (
                <label
                  key={option.id}
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
