import type { ActionResult } from "@/modules/access/action-state";

/** Inline status line for an admin form. */
export function FormMessage({ state }: { state: ActionResult }) {
  if (state.status === "idle") return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-success"}
    >
      {state.message}
    </p>
  );
}
