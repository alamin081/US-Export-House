/**
 * Result of an inventory Server Action. Dependency-free so client components
 * can import it without pulling server code into the browser bundle.
 */
export type InventoryActionResult<T = undefined> =
  | { status: "success"; message: string; data: T }
  | {
      status: "error";
      message: string;
      /** Form field the message belongs to ("delta", "lines.3", ...). */
      field?: string;
      /** The same request goes through once the user confirms. */
      needsConfirmation?: boolean;
      /** The file was imported before (CSV import). */
      duplicate?: boolean;
    };
