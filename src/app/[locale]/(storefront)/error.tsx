"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * The raw error is never shown to the customer; in Phase 13 it is forwarded to
 * the error tracker instead of the console.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error("[storefront]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="site-container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("errorTitle")}</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">{t("errorBody")}</p>
      <Button onClick={reset} className="mt-6">
        {t("tryAgain")}
      </Button>
    </div>
  );
}
