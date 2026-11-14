/**
 * Result of a catalogue Server Action. Dependency-free so client components
 * can import it without pulling server code into the browser bundle.
 */
export type CatalogActionResult<T = undefined> =
  | { status: "success"; message: string; data: T }
  | {
      status: "error";
      message: string;
      /** Field path ("variants.0.sku") -> message, shown next to the field. */
      fieldErrors: Record<string, string>;
      /** Set when someone else saved first (optimistic lock). */
      conflict?: boolean;
    };
