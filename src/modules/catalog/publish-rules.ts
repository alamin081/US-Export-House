/**
 * What a product needs before it may be published (owner's rule, Phase 6):
 * a name in both languages, at least one image, at least one active variant,
 * and every active variant priced above zero. Pure, so the admin can show the
 * missing items live and bulk publish can explain each failure.
 */

export type PublishRequirement = "name_en" | "name_bn" | "image" | "active_variant" | "price";

export interface PublishCandidate {
  nameEn: string;
  nameBn: string | null;
  imageCount: number;
  variants: ReadonlyArray<{ isActive: boolean; deleted: boolean; pricePoisha: number }>;
}

export const PUBLISH_REQUIREMENT_LABELS: Record<PublishRequirement, string> = {
  name_en: "English name",
  name_bn: "Bengali name",
  image: "At least one image",
  active_variant: "At least one active variant",
  price: "A price above zero on every active variant",
};

export function missingForPublish(product: PublishCandidate): PublishRequirement[] {
  const missing: PublishRequirement[] = [];
  if (product.nameEn.trim() === "") missing.push("name_en");
  if ((product.nameBn ?? "").trim() === "") missing.push("name_bn");
  if (product.imageCount < 1) missing.push("image");

  const active = product.variants.filter((variant) => variant.isActive && !variant.deleted);
  if (active.length === 0) missing.push("active_variant");
  if (active.length > 0 && active.some((variant) => variant.pricePoisha <= 0)) {
    missing.push("price");
  }
  return missing;
}

/** Warnings shown on drafts that are not blocking yet. */
export function draftWarnings(product: PublishCandidate): string[] {
  const warnings: string[] = [];
  if ((product.nameBn ?? "").trim() === "") warnings.push("Bengali translation missing");
  const active = product.variants.filter((variant) => variant.isActive && !variant.deleted);
  if (active.length === 0 || active.some((variant) => variant.pricePoisha <= 0)) {
    warnings.push("No price yet");
  }
  return warnings;
}
