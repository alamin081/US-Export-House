/**
 * Bulk image file names — pure, used in the browser before anything uploads.
 *
 *   {product_code}_{n}.jpg            product image number n (1 = main)
 *   {product_code}_{COLOUR}_{n}.jpg   image of that colour (3-letter code)
 *
 * Product codes contain "-" but never "_", so "_" separates the parts. Case
 * is ignored. Only JPEG, PNG and WebP are taken.
 */

export interface ImageMatchProduct {
  id: string;
  code: string;
  nameEn: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  imageCount: number;
  colours: ReadonlyArray<{ id: string; code: string | null; valueEn: string }>;
}

export type ImageMatch =
  | {
      ok: true;
      productId: string;
      code: string;
      colourId: string | null;
      colourCode: string | null;
      order: number;
    }
  | { ok: false; reason: string };

const EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export function matchImageName(
  fileName: string,
  products: ReadonlyMap<string, ImageMatchProduct>,
): ImageMatch {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  if (!EXTENSIONS.test(name)) return { ok: false, reason: "Only JPG, PNG or WebP." };
  const parts = name.replace(EXTENSIONS, "").split("_");
  const last = parts.pop() ?? "";
  if (!/^\d{1,3}$/.test(last) || Number(last) < 1 || parts.length < 1 || parts.length > 2) {
    return { ok: false, reason: "Name must be CODE_1.jpg or CODE_COLOUR_1.jpg." };
  }
  const code = (parts[0] ?? "").trim().toUpperCase();
  const product = products.get(code);
  if (product === undefined) return { ok: false, reason: `No product with code ${code}.` };
  let colourId: string | null = null;
  let colourCode: string | null = null;
  if (parts.length === 2) {
    const wanted = (parts[1] ?? "").trim().toUpperCase();
    const colour = product.colours.find(
      (candidate) =>
        (candidate.code ?? "").toUpperCase() === wanted ||
        candidate.valueEn.toUpperCase().replace(/\s+/g, "") === wanted,
    );
    if (colour === undefined) return { ok: false, reason: `Colour ${wanted} is not on ${code}.` };
    colourId = colour.id;
    colourCode = colour.code ?? wanted;
  }
  return { ok: true, productId: product.id, code, colourId, colourCode, order: Number(last) };
}

/** Keys of matches that land in the same place (same product, colour and number). */
export function conflictingSlots(matches: ReadonlyArray<ImageMatch>): Set<string> {
  const seen = new Map<string, number>();
  for (const match of matches) {
    if (!match.ok) continue;
    const key = slotKey(match);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
}

export function slotKey(match: Extract<ImageMatch, { ok: true }>): string {
  return `${match.productId}|${match.colourId ?? "-"}|${match.order}`;
}
