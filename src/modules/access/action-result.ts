import "server-only";

import { isAppError } from "@/lib/errors";
import type { ActionResult } from "./action-state";
import { PASSWORD_PROBLEM_MESSAGES, type PasswordProblem } from "./password";

/**
 * Maps service errors to the form result. Unknown errors are reduced to a
 * generic message: stack traces and internal messages never reach the browser.
 */

export function actionError(error: unknown): ActionResult {
  // Next.js uses thrown errors for redirects; they must keep propagating.
  if (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }

  if (isAppError(error)) {
    const details = error.details ?? {};
    const field = typeof details.field === "string" ? details.field : undefined;
    const problems = Array.isArray(details.problems) ? (details.problems as PasswordProblem[]) : [];

    const message =
      problems.length > 0
        ? problems.map((problem) => PASSWORD_PROBLEM_MESSAGES[problem]).join(" ")
        : error.code === "FORBIDDEN"
          ? "You do not have permission to do that."
          : error.code === "UNAUTHENTICATED"
            ? "Your session has ended. Sign in again."
            : error.message;

    return { status: "error", message, ...(field === undefined ? {} : { field }) };
  }

  console.error("[action] unexpected error", error instanceof Error ? error.name : "unknown");
  return { status: "error", message: "Something went wrong. Please try again." };
}

/** First validation message from a failed Zod parse. */
export function zodFailure(issues: ReadonlyArray<{ message: string; path: PropertyKey[] }>) {
  const first = issues[0];
  return {
    status: "error" as const,
    message: first?.message ?? "Check the form and try again.",
    ...(first?.path[0] === undefined ? {} : { field: String(first.path[0]) }),
  };
}
