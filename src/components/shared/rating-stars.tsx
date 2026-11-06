import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface RatingStarsProps {
  /** 0 to 5, may be fractional. */
  rating: number;
  reviewCount?: number;
  size?: "sm" | "md";
  className?: string;
}

export function RatingStars({ rating, reviewCount, size = "sm", className }: RatingStarsProps) {
  const t = useTranslations("Product");
  const rounded = Math.round(rating);
  const starSize = size === "sm" ? "size-3.5" : "size-4";

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              starSize,
              star <= rounded ? "fill-foreground text-foreground" : "text-border",
            )}
          />
        ))}
      </span>
      <span className="sr-only">{t("ratingOutOfFive", { rating: rating.toFixed(1) })}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {rating.toFixed(1)}
        {reviewCount === undefined ? null : ` (${reviewCount})`}
      </span>
    </span>
  );
}
