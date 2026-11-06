"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Accessible name, e.g. the product title this stepper belongs to. */
  itemLabel: string;
  size?: "sm" | "md";
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  itemLabel,
  size = "md",
  className,
}: QuantityStepperProps) {
  const t = useTranslations("Cart");
  const buttonSize = size === "sm" ? "size-8" : "size-10";

  return (
    <div
      className={cn("inline-flex items-center rounded-md border border-input", className)}
      role="group"
      aria-label={t("quantityFor", { item: itemLabel })}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t("decrease")}
        className={cn(
          buttonSize,
          "inline-flex items-center justify-center rounded-s-md hover:bg-secondary disabled:opacity-40",
        )}
      >
        <Minus aria-hidden="true" className="size-3.5" />
      </button>

      <span
        aria-live="polite"
        className={cn(
          "min-w-9 text-center text-sm font-medium tabular-nums",
          size === "sm" && "min-w-8",
        )}
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={t("increase")}
        className={cn(
          buttonSize,
          "inline-flex items-center justify-center rounded-e-md hover:bg-secondary disabled:opacity-40",
        )}
      >
        <Plus aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
