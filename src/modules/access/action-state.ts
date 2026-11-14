/**
 * The result every admin Server Action returns to its form.
 *
 * Kept in its own dependency-free file so client components can import it
 * without pulling server code (argon2, Prisma) into the browser bundle.
 */
export type ActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; field?: string };

export const IDLE: ActionResult = { status: "idle" };
