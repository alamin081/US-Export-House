/**
 * Product codes and SKUs.
 *
 * Format agreed with the business (2026-11-14):
 *   product code  UEH-{CATEGORY_CODE}{4 digits}        e.g. UEH-SH0012
 *   SKU           {PRODUCT_CODE}-{COLOUR}-{SIZE}       e.g. UEH-SH0012-NVY-L
 * Only capital English letters, digits and hyphens. The pattern itself is the
 * `catalog.skuPattern` setting; SKUs that already exist are never rewritten.
 */

export const SKU_MAX_LENGTH = 64;
export const DEFAULT_SKU_PATTERN = "{PRODUCT_CODE}-{COLOUR}-{SIZE}";
export const DEFAULT_PRODUCT_CODE_PREFIX = "UEH";

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const CATEGORY_CODE_PATTERN = /^[A-Z]{2,4}$/;
const OPTION_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
const BARCODE_PATTERN = /^[A-Z0-9-]{4,64}$/;

export function isValidSku(value: string): boolean {
  return value.length <= SKU_MAX_LENGTH && SKU_PATTERN.test(value);
}

export function isValidCategoryCode(value: string): boolean {
  return CATEGORY_CODE_PATTERN.test(value);
}

export function isValidOptionCode(value: string): boolean {
  return OPTION_CODE_PATTERN.test(value);
}

export function isValidBarcode(value: string): boolean {
  return BARCODE_PATTERN.test(value);
}

/** Upper-cases and drops every character a SKU may not contain. */
export function toSkuSegment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
}

/** UEH-SH0012 from prefix "UEH", category code "SH" and running number 12. */
export function buildProductCode(prefix: string, categoryCode: string, sequence: number): string {
  if (!isValidCategoryCode(categoryCode)) {
    throw new Error(`Invalid category code "${categoryCode}"`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error(`Product code sequence out of range: ${sequence}`);
  }
  return `${toSkuSegment(prefix)}-${categoryCode}${String(sequence).padStart(4, "0")}`;
}

/**
 * Fills the SKU pattern. Tokens whose value is missing (a product without a
 * colour option, say) are removed together with their hyphen.
 */
export function renderSku(
  pattern: string,
  parts: { productCode: string; colour?: string | null; size?: string | null },
): string {
  const values: Record<string, string> = {
    PRODUCT_CODE: parts.productCode.toUpperCase().replace(/[^A-Z0-9-]+/g, ""),
    COLOUR: toSkuSegment(parts.colour ?? ""),
    SIZE: toSkuSegment(parts.size ?? ""),
  };

  return pattern
    .replace(/\{(PRODUCT_CODE|COLOUR|SIZE)\}/g, (_, token: string) => values[token] ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKU_MAX_LENGTH);
}
