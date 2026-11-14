import "server-only";

import { isAppError } from "@/lib/errors";
import type { InventoryActionResult } from "./inventory-action-state";

/**
 * Maps a thrown error to a form result. Unknown errors become a generic
 * message: stack traces and internal messages never reach the browser.
 */
export function inventoryActionError(error: unknown): InventoryActionResult<never> {
  // Next.js redirects and notFound() are thrown; they must keep propagating.
  if (error instanceof Error && "digest" in error && typeof error.digest === "string") {
    if (error.digest.startsWith("NEXT_")) throw error;
  }
  if (isAppError(error)) {
    const details = error.details ?? {};
    const message =
      error.code === "FORBIDDEN"
        ? "You do not have permission to do that."
        : error.code === "UNAUTHENTICATED"
          ? "Your session has ended. Sign in again."
          : error.message;
    return {
      status: "error",
      message,
      ...(typeof details.field === "string" ? { field: details.field } : {}),
      ...(details.needsConfirmation === true ? { needsConfirmation: true } : {}),
      ...(details.reason === "duplicate_file" ? { duplicate: true } : {}),
    };
  }
  console.error("[inventory] unexpected error", error instanceof Error ? error.name : "unknown");
  return { status: "error", message: "Something went wrong. Please try again." };
}
