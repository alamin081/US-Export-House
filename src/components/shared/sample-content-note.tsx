import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Visible marker for sample data (spec section 8: mock content must never be
 * mistaken for the real thing). Used on review sections, the mock cart, the
 * sample order history and the draft policy page.
 */
export function SampleContentNote({
  messageKey = "sampleData",
  className,
}: {
  messageKey?: "sampleData" | "sampleReviews" | "sampleOrders" | "draftPolicy" | "mockCourier";
  className?: string;
}) {
  const t = useTranslations("Placeholder");

  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{t(messageKey)}</span>
    </p>
  );
}
