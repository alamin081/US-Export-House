"use client";

import { useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";

import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface PurchaseColour {
  name: string;
  hex: string;
}

export interface PurchasePanelProps {
  productName: string;
  sizes: readonly string[];
  colours: readonly PurchaseColour[];
  availability: "in_stock" | "low_stock" | "out_of_stock";
  /** Denim uses waist sizes, so the label differs. */
  sizeLabel?: string;
}

/**
 * Size, colour and quantity selection.
 *
 * PHASE 3: "Add to cart" only exercises the interaction and success state.
 * Nothing is stored and no stock is reserved - the cart Server Action and the
 * conditional stock reservation arrive in Phase 8.
 */
export function ProductPurchasePanel({
  productName,
  sizes,
  colours,
  availability,
  sizeLabel,
}: PurchasePanelProps) {
  const t = useTranslations("Product");
  const tPlaceholder = useTranslations("Placeholder");

  const [size, setSize] = useState<string | undefined>(undefined);
  const [colour, setColour] = useState<string | undefined>(colours[0]?.name);
  const [quantity, setQuantity] = useState(1);
  const [showSizeError, setShowSizeError] = useState(false);
  const [added, setAdded] = useState(false);

  const soldOut = availability === "out_of_stock";

  function onAddToCart() {
    if (size === undefined) {
      setShowSizeError(true);
      return;
    }
    setShowSizeError(false);
    setAdded(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Size */}
      <fieldset>
        <div className="flex items-center justify-between">
          <legend className="text-xs font-medium tracking-[0.18em] uppercase">
            {sizeLabel ?? t("sizeLabel")}
          </legend>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sizes.map((option) => {
            const isActive = option === size;
            return (
              <label
                key={option}
                className={cn(
                  "cursor-pointer rounded-md border px-4 py-2.5 text-sm tabular-nums transition-colors",
                  isActive
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-input hover:border-foreground",
                  soldOut && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="size"
                  value={option}
                  checked={isActive}
                  disabled={soldOut}
                  onChange={() => {
                    setSize(option);
                    setShowSizeError(false);
                    setAdded(false);
                  }}
                  className="sr-only"
                />
                {option}
              </label>
            );
          })}
        </div>
        {showSizeError ? (
          <FieldHint tone="error" role="alert">
            {t("selectSize")}
          </FieldHint>
        ) : null}
      </fieldset>

      {/* Colour */}
      {colours.length > 0 ? (
        <fieldset>
          <legend className="text-xs font-medium tracking-[0.18em] uppercase">
            {t("colourLabel")}
            {colour === undefined ? null : (
              <span className="ms-2 font-normal tracking-normal text-muted-foreground normal-case">
                {colour}
              </span>
            )}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {colours.map((option) => {
              const isActive = option.name === colour;
              return (
                <label
                  key={option.name}
                  title={option.name}
                  className={cn(
                    "cursor-pointer rounded-full p-0.5 transition-shadow",
                    isActive ? "ring-2 ring-foreground ring-offset-2" : "ring-1 ring-border",
                  )}
                >
                  <input
                    type="radio"
                    name="colour"
                    value={option.name}
                    checked={isActive}
                    onChange={() => {
                      setColour(option.name);
                      setAdded(false);
                    }}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="block size-7 rounded-full"
                    style={{ backgroundColor: option.hex }}
                  />
                  <span className="sr-only">{option.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Quantity + add to cart */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium tracking-[0.18em] uppercase">{t("quantity")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            onChange={(next) => {
              setQuantity(next);
              setAdded(false);
            }}
            max={availability === "low_stock" ? 3 : 10}
            itemLabel={productName}
          />
          <Button
            onClick={onAddToCart}
            disabled={soldOut}
            size="lg"
            className="flex-1 sm:flex-none"
          >
            {added ? (
              <>
                <Check aria-hidden="true" />
                {t("addedToCart")}
              </>
            ) : (
              <>
                <ShoppingBag aria-hidden="true" />
                {soldOut ? t("outOfStock") : t("addToCart")}
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{tPlaceholder("notConnected")}</p>
      </div>
    </div>
  );
}
