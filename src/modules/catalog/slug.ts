/**
 * URL slugs. One English slug serves both locales (decided 2026-11-14), so a
 * slug is always lower-case Latin letters, digits and single hyphens.
 */

export const SLUG_MAX_LENGTH = 80;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Suggests a slug from a name: accents are stripped, everything that is not a
 * Latin letter or digit becomes a hyphen. A Bengali-only name gives "", and
 * the admin form then asks for a slug to be typed.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * First free slug: `base`, then `base-2`, `base-3`, ... `isTaken` is asked
 * once per candidate, so the caller decides what "taken" means (e.g. ignoring
 * the record being edited).
 */
export async function firstFreeSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  const root = base.slice(0, SLUG_MAX_LENGTH - 4).replace(/-+$/g, "");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? root : `${root}-${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`No free slug for "${base}" after ${maxAttempts} attempts`);
}
