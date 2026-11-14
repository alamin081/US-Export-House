import "server-only";

import { isAppError } from "@/lib/errors";
import type { CatalogActionResult } from "./catalog-action-state";

/**
 * Maps a thrown error to a form result. Unknown errors become a generic
 * message: stack traces and internal messages never reach the browser.
 */
export function catalogActionError(error: unknown): CatalogActionResult<never> {
  // Next.js redirects and notFound() are thrown; they must keep propagating.
  if (error instanceof Error && "digest" in error && typeof error.digest === "string") {
    if (error.digest.startsWith("NEXT_")) throw error;
  }

  if (isAppError(error)) {
    const fieldErrors = (error.details?.fieldErrors ?? {}) as Record<string, string>;
    const field = typeof error.details?.field === "string" ? error.details.field : undefined;
    const message =
      error.code === "FORBIDDEN"
        ? "You do not have permission to do that."
        : error.code === "UNAUTHENTICATED"
          ? "Your session has ended. Sign in again."
          : error.message;
    return {
      status: "error",
      message,
      fieldErrors: field === undefined ? fieldErrors : { ...fieldErrors, [field]: message },
      ...(error.details?.reason === "version_conflict" ? { conflict: true } : {}),
    };
  }

  console.error("[catalog] unexpected error", error instanceof Error ? error.name : "unknown");
  return { status: "error", message: "Something went wrong. Please try again.", fieldErrors: {} };
}
