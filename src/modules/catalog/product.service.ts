import { PAGE_SIZE } from "@/config/constants";
import { AppError } from "@/lib/errors";
import {
  assertPermission,
  hasAnyPermission,
  hasPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { deleteStoredFiles, verifyUploadToken } from "@/modules/media/media.service";
import { getCatalogSettings } from "@/modules/settings/settings.service";
import {
  countOrderLinesForProduct,
  createDraftProduct,
  findBrandById,
  findCategoriesByIds,
  findPresetsByIds,
  findProductForEdit,
  findProductsForStatusChange,
  findSizeChartById,
  findTagsByIds,
  findTakenBarcodes,
  findTakenSkus,
  isProductSlugTaken,
  listAdminProducts,
  listProductFormReferences,
  ProductVersionConflict,
  saveProductContent,
  saveProductGraph,
  softDeleteProduct,
  uniqueViolationTarget,
  updateProductStatus,
  type PlannedImage,
  type PlannedOptionValue,
  type PlannedVariant,
  type ProductEditGraph,
  type ProductScalars,
} from "./catalog.repository";
import {
  fieldErrorsFrom,
  productContentSchema,
  productDraftSchema,
  productListQuerySchema,
  productSaveSchema,
  productStatusChangeSchema,
  type ProductContentInput,
  type ProductSaveInput,
} from "./catalog.schema";
import {
  missingForPublish,
  PUBLISH_REQUIREMENT_LABELS,
  type PublishRequirement,
} from "./publish-rules";
import { searchTerms } from "./search-text";
import { toSkuSegment } from "./sku";
import { combinationKey, duplicateKeys } from "./variant-matrix";

/**
 * Products: list, edit, save (product + variants in one transaction), publish,
 * archive and delete. Every function takes the acting staff member and checks
 * permissions itself, so a forgotten page or action check still fails safe.
 */

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/** Validation failure with per-field messages ("variants.0.sku": "..."). */
function invalid(
  fieldErrors: Record<string, string>,
  message = "Check the highlighted fields.",
): AppError {
  return new AppError("VALIDATION_FAILED", message, { details: { fieldErrors } });
}

function versionConflict(): AppError {
  return new AppError(
    "CONFLICT",
    "Someone else saved this product while you were editing. Reload to see their changes, then apply yours again.",
    { details: { reason: "version_conflict" } },
  );
}

function mapSaveError(error: unknown): never {
  if (error instanceof ProductVersionConflict) throw versionConflict();
  const target = uniqueViolationTarget(error);
  if (target !== null) {
    const joined = target.join(",");
    if (joined.includes("sku"))
      throw invalid({ variants: "A SKU is already used by another variant." });
    if (joined.includes("barcode"))
      throw invalid({ variants: "A barcode is already used by another variant." });
    if (joined.includes("slug")) throw invalid({ slug: "This slug is already used." });
    if (joined.includes("optionKey")) {
      throw invalid({ variants: "Two variants have the same size and colour." });
    }
    throw new AppError("CONFLICT", "This change clashes with existing data. Reload and try again.");
  }
  throw error;
}

// ---------------------------------------------------------------------------
// list and read
// ---------------------------------------------------------------------------

export async function listProductsForAdmin(actor: StaffContext, rawQuery: Record<string, unknown>) {
  assertPermission(actor, "catalog.read");
  const query = productListQuerySchema.parse(rawQuery);
  const take = PAGE_SIZE.admin;
  const { rows, total } = await listAdminProducts({
    terms: searchTerms(query.q ?? ""),
    ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
    ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    sort: query.sort,
    skip: (query.page - 1) * take,
    take,
  });

  return {
    query,
    total,
    pageCount: Math.max(1, Math.ceil(total / take)),
    items: rows.map((row) => {
      const prices = row.variants.map((variant) => variant.pricePoisha);
      return {
        id: row.id,
        slug: row.slug,
        code: row.code,
        nameEn: row.nameEn,
        missingBengali: (row.nameBn ?? "").trim() === "",
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        categoryName: row.category.nameEn,
        brandName: row.brand?.nameEn ?? null,
        thumbnail: row.images[0] ?? null,
        variantCount: row.variants.length,
        minPricePoisha: prices.length === 0 ? null : Math.min(...prices),
        maxPricePoisha: prices.length === 0 ? null : Math.max(...prices),
      };
    }),
  };
}

export async function getProductFormReferences(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  const [references, settings] = await Promise.all([
    listProductFormReferences(),
    getCatalogSettings(),
  ]);
  return { ...references, fits: settings.fits, skuPattern: settings.skuPattern };
}

function paragraphs(value: string | null): string[] | null {
  if (value === null) return null;
  const parts = value
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return parts.length === 0 ? null : parts;
}

function lines(value: string | null): string[] | null {
  if (value === null) return null;
  const parts = value
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 0 ? null : parts;
}

function jsonText(value: unknown, separator: string): string {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join(separator)
    : "";
}

/** The edit form's view of a product, with prices kept in poisha. */
export async function getProductForEdit(actor: StaffContext, productId: string) {
  assertPermission(actor, "catalog.read");
  const product = await findProductForEdit(productId);
  if (product === null) throw new AppError("NOT_FOUND", "Product not found.");
  return toEditView(product);
}

function toEditView(product: ProductEditGraph) {
  const valuesOf = (type: "SIZE" | "COLOUR") =>
    product.options
      .filter((option) => option.type === type)
      .flatMap((option) => option.values)
      .map((value) => ({
        id: value.id,
        valueEn: value.valueEn,
        valueBn: value.valueBn,
        hex: value.hex,
        code: value.code,
        presetId: value.presetId,
      }));
  const sizes = valuesOf("SIZE");
  const colours = valuesOf("COLOUR");
  const sizeIds = new Set(sizes.map((value) => value.id));
  const colourIds = new Set(colours.map((value) => value.id));

  return {
    id: product.id,
    version: product.version,
    code: product.code,
    status: product.status,
    slug: product.slug,
    nameEn: product.nameEn,
    nameBn: product.nameBn ?? "",
    summaryEn: product.summaryEn ?? "",
    summaryBn: product.summaryBn ?? "",
    descriptionEn: jsonText(product.descriptionEn, "\n\n"),
    descriptionBn: jsonText(product.descriptionBn, "\n\n"),
    fabricEn: product.fabricEn ?? "",
    fabricBn: product.fabricBn ?? "",
    careEn: jsonText(product.careEn, "\n"),
    careBn: jsonText(product.careBn, "\n"),
    seoTitleEn: product.seoTitleEn ?? "",
    seoTitleBn: product.seoTitleBn ?? "",
    seoDescriptionEn: product.seoDescriptionEn ?? "",
    seoDescriptionBn: product.seoDescriptionBn ?? "",
    categoryId: product.categoryId,
    categoryCode: product.category.code,
    extraCategoryIds: product.extraCategories.map((row) => row.categoryId),
    brandId: product.brandId,
    sizeChartId: product.sizeChartId,
    fit: product.fit,
    tagIds: product.tags.map((row) => row.tagId),
    isNew: product.isNew,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    archivedVariantCount: product._count.variants,
    sizes,
    colours,
    variants: product.variants.map((variant) => {
      const valueIds = variant.optionValues.map((link) => link.optionValueId);
      return {
        id: variant.id,
        sizeRef: valueIds.find((valueId) => sizeIds.has(valueId)) ?? null,
        colourRef: valueIds.find((valueId) => colourIds.has(valueId)) ?? null,
        sku: variant.sku,
        barcode: variant.barcode ?? "",
        pricePoisha: variant.pricePoisha,
        comparePricePoisha: variant.comparePricePoisha,
        weightGrams: variant.weightGrams,
        isActive: variant.isActive,
        // Read-only stock (Phase 7 manages it).
        onHand: variant.inventoryLevels.reduce((sum, level) => sum + level.onHand, 0),
        reserved: variant.inventoryLevels.reduce((sum, level) => sum + level.reserved, 0),
      };
    }),
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      altEn: image.altEn ?? "",
      altBn: image.altBn ?? "",
      colourRef: image.optionValueId,
      width: image.width,
      height: image.height,
      storageProvider: image.storageProvider,
    })),
    missingForPublish: missingForPublish({
      nameEn: product.nameEn,
      nameBn: product.nameBn,
      imageCount: product.images.length,
      variants: product.variants.map((variant) => ({
        isActive: variant.isActive,
        deleted: false,
        pricePoisha: variant.pricePoisha,
      })),
    }),
  };
}

export type ProductEditView = ReturnType<typeof toEditView>;

// ---------------------------------------------------------------------------
// save (create or update), the full form
// ---------------------------------------------------------------------------

export interface SavedProduct {
  id: string;
  slug: string;
  version: number;
  /** Slugs whose storefront pages must be refreshed. */
  affectedSlugs: string[];
}

function scalarsFrom(input: ProductSaveInput): ProductScalars {
  return {
    slug: input.slug,
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    summaryEn: input.summaryEn,
    summaryBn: input.summaryBn,
    descriptionEn: paragraphs(input.descriptionEn),
    descriptionBn: paragraphs(input.descriptionBn),
    fabricEn: input.fabricEn,
    fabricBn: input.fabricBn,
    careEn: lines(input.careEn),
    careBn: lines(input.careBn),
    categoryId: input.categoryId,
    brandId: input.brandId ?? null,
    sizeChartId: input.sizeChartId ?? null,
    fit: input.fit ?? null,
    isNew: input.isNew,
    isFeatured: input.isFeatured,
    isBestseller: input.isBestseller,
    seoTitleEn: input.seoTitleEn,
    seoTitleBn: input.seoTitleBn,
    seoDescriptionEn: input.seoDescriptionEn,
    seoDescriptionBn: input.seoDescriptionBn,
  };
}

interface ResolvedValue {
  ref: string;
  type: "SIZE" | "COLOUR";
  valueEn: string;
  valueBn: string | null;
  code: string;
  planned: PlannedOptionValue;
}

/**
 * Turns the selected sizes and colours into option values: existing values of
 * this product are reused, presets are copied (or matched to an existing value
 * with the same English name, so the unique (option, value) pair holds).
 */
async function resolveOptionValues(
  input: ProductSaveInput,
  existing: ProductEditGraph | null,
  errors: Record<string, string>,
): Promise<Map<string, ResolvedValue>> {
  const resolved = new Map<string, ResolvedValue>();
  const existingValues = new Map<
    string,
    {
      id: string;
      type: "SIZE" | "COLOUR";
      valueEn: string;
      valueBn: string | null;
      code: string | null;
    }
  >();
  for (const option of existing?.options ?? []) {
    for (const value of option.values)
      existingValues.set(value.id, { ...value, type: option.type });
  }

  const presetIds = [...input.sizes, ...input.colours]
    .map((value) => value.ref)
    .filter((ref) => ref.startsWith("preset:"))
    .map((ref) => ref.slice("preset:".length));
  const presets = new Map((await findPresetsByIds(presetIds)).map((preset) => [preset.id, preset]));

  const add = (
    list: ProductSaveInput["sizes"],
    type: "SIZE" | "COLOUR",
    field: "sizes" | "colours",
  ) => {
    list.forEach((value, index) => {
      if (resolved.has(value.ref)) {
        errors[`${field}.${index}`] = "Selected twice.";
        return;
      }
      const current = existingValues.get(value.ref);
      if (current !== undefined && current.type === type) {
        resolved.set(value.ref, {
          ref: value.ref,
          type,
          valueEn: current.valueEn,
          valueBn: current.valueBn,
          code: current.code ?? toSkuSegment(current.valueEn).slice(0, type === "COLOUR" ? 3 : 6),
          planned: { ref: value.ref, type, existingId: current.id },
        });
        return;
      }
      const preset = value.ref.startsWith("preset:") ? presets.get(value.ref.slice(7)) : undefined;
      if (preset === undefined || preset.type !== type) {
        errors[`${field}.${index}`] = "Unknown option value.";
        return;
      }
      const sameName = [...existingValues.values()].find(
        (candidate) => candidate.type === type && candidate.valueEn === preset.valueEn,
      );
      resolved.set(value.ref, {
        ref: value.ref,
        type,
        valueEn: preset.valueEn,
        valueBn: preset.valueBn,
        code: preset.code,
        planned:
          sameName === undefined
            ? {
                ref: value.ref,
                type,
                create: {
                  valueEn: preset.valueEn,
                  valueBn: preset.valueBn,
                  hex: preset.hex,
                  code: preset.code,
                  presetId: preset.id,
                  sortOrder: preset.sortOrder,
                },
              }
            : { ref: value.ref, type, existingId: sameName.id },
      });
    });
  };
  add(input.sizes, "SIZE", "sizes");
  add(input.colours, "COLOUR", "colours");

  // Values existing variants already use stay resolvable even when they are no
  // longer ticked, so those variants keep their labels and SKU parts.
  for (const [valueId, value] of existingValues) {
    if (resolved.has(valueId)) continue;
    resolved.set(valueId, {
      ref: valueId,
      type: value.type,
      valueEn: value.valueEn,
      valueBn: value.valueBn,
      code: value.code ?? toSkuSegment(value.valueEn).slice(0, value.type === "COLOUR" ? 3 : 6),
      planned: { ref: valueId, type: value.type, existingId: valueId },
    });
  }
  return resolved;
}

async function validateReferences(input: ProductSaveInput, errors: Record<string, string>) {
  const settings = await getCatalogSettings();
  const categoryIds = [input.categoryId, ...input.extraCategoryIds];
  const categories = new Map((await findCategoriesByIds(categoryIds)).map((row) => [row.id, row]));
  const primary = categories.get(input.categoryId);
  if (primary === undefined) errors.categoryId = "Choose a category.";
  input.extraCategoryIds.forEach((categoryId, index) => {
    if (!categories.has(categoryId)) errors[`extraCategoryIds.${index}`] = "Unknown category.";
    if (categoryId === input.categoryId)
      errors[`extraCategoryIds.${index}`] = "Already the main category.";
  });
  if (input.brandId != null && (await findBrandById(input.brandId)) === null) {
    errors.brandId = "Unknown brand.";
  }
  if (input.sizeChartId != null && (await findSizeChartById(input.sizeChartId)) === null) {
    errors.sizeChartId = "Unknown size chart.";
  }
  if (input.fit != null && !settings.fits.some((fit) => fit.key === input.fit)) {
    errors.fit = "Choose a fit from the list.";
  }
  if (input.tagIds.length > 0) {
    const tags = new Set((await findTagsByIds(input.tagIds)).map((tag) => tag.id));
    input.tagIds.forEach((tagId, index) => {
      if (!tags.has(tagId)) errors[`tagIds.${index}`] = "Unknown tag.";
    });
  }
  return { settings, primary };
}

function labelOf(
  size: ResolvedValue | undefined,
  colour: ResolvedValue | undefined,
  locale: "en" | "bn",
) {
  const parts = [size, colour]
    .filter((value): value is ResolvedValue => value !== undefined)
    .map((value) => (locale === "bn" ? (value.valueBn ?? value.valueEn) : value.valueEn));
  return parts.length === 0 ? null : parts.join(" / ");
}

export async function saveProduct(
  actor: StaffContext,
  rawInput: unknown,
  meta: RequestMeta,
): Promise<SavedProduct> {
  assertPermission(actor, "catalog.write");

  const parsed = productSaveSchema.safeParse(rawInput);
  if (!parsed.success) throw invalid(fieldErrorsFrom(parsed.error.issues));
  const input = parsed.data;
  const isNew = input.id === undefined;
  const errors: Record<string, string> = {};

  const existing = isNew ? null : await findProductForEdit(input.id ?? "");
  if (!isNew && existing === null) throw new AppError("NOT_FOUND", "Product not found.");
  if (!isNew && input.version === undefined) errors.version = "Missing version.";

  const { settings, primary } = await validateReferences(input, errors);
  if (await isProductSlugTaken(input.slug, input.id)) errors.slug = "This slug is already used.";

  // --- options and variants -----------------------------------------------
  const values = await resolveOptionValues(input, existing, errors);
  const selectedRefs = new Set([...input.sizes, ...input.colours].map((value) => value.ref));
  const existingVariants = new Map(
    (existing?.variants ?? []).map((variant) => [variant.id, variant]),
  );
  const canPrice = hasPermission(actor, "catalog.price.write");
  const productCode = existing?.code ?? null;
  const priceChanges: Array<{
    sku: string;
    before: { price: number; compare: number | null } | null;
    after: { price: number; compare: number | null };
  }> = [];

  const plannedVariants: PlannedVariant[] = [];
  const combinationKeys: string[] = [];
  input.variants.forEach((variant, index) => {
    const at = (field: string) => `variants.${index}.${field}`;
    const current = variant.id === undefined ? undefined : existingVariants.get(variant.id);
    if (variant.id !== undefined && current === undefined) {
      errors[at("id")] = "This variant no longer exists. Reload the page.";
      return;
    }

    // Existing variants keep their combination; new ones take it from the form.
    let sizeRef = variant.sizeRef ?? null;
    let colourRef = variant.colourRef ?? null;
    if (current !== undefined) {
      const ids = current.optionValues.map((link) => link.optionValueId);
      sizeRef = ids.find((valueId) => values.get(valueId)?.type === "SIZE") ?? null;
      colourRef = ids.find((valueId) => values.get(valueId)?.type === "COLOUR") ?? null;
    }
    const size = sizeRef === null ? undefined : values.get(sizeRef);
    const colour = colourRef === null ? undefined : values.get(colourRef);
    if (current === undefined && sizeRef !== null && !selectedRefs.has(sizeRef)) {
      errors[at("sizeRef")] = "Select this size above first.";
    }
    if (current === undefined && colourRef !== null && !selectedRefs.has(colourRef)) {
      errors[at("colourRef")] = "Select this colour above first.";
    }
    if (input.sizes.length > 0 && sizeRef === null && current === undefined)
      errors[at("sizeRef")] = "Choose a size.";
    if (input.colours.length > 0 && colourRef === null && current === undefined)
      errors[at("colourRef")] = "Choose a colour.";
    combinationKeys.push(
      combinationKey(
        size === undefined ? null : { ref: size.ref, code: size.code },
        colour === undefined ? null : { ref: colour.ref, code: colour.code },
      ),
    );

    if (variant.sku === "" && productCode === null && !isNew) {
      errors[at("sku")] = "Enter a SKU: this older product has no product code to build one from.";
    }

    const before =
      current === undefined
        ? null
        : { price: current.pricePoisha, compare: current.comparePricePoisha };
    const after = { price: variant.price, compare: variant.comparePrice };
    const priceChanged =
      before === null
        ? after.price !== 0 || after.compare !== null
        : before.price !== after.price || before.compare !== after.compare;
    if (priceChanged && !canPrice)
      errors[at("price")] = "You do not have permission to change prices.";
    if (priceChanged)
      priceChanges.push({ sku: variant.sku || current?.sku || "(new)", before, after });

    plannedVariants.push({
      ...(variant.id === undefined ? {} : { id: variant.id }),
      sizeRef,
      colourRef,
      sku: variant.sku,
      skuParts: { size: size?.code ?? null, colour: colour?.code ?? null },
      barcode: variant.barcode,
      pricePoisha: variant.price,
      comparePricePoisha: variant.comparePrice,
      weightGrams: variant.weightGrams ?? null,
      isActive: variant.isActive,
      labelEn: labelOf(size, colour, "en"),
      labelBn: labelOf(size, colour, "bn"),
    });
  });

  for (const key of duplicateKeys(combinationKeys)) {
    const index = combinationKeys.lastIndexOf(key);
    errors[`variants.${index}.sizeRef`] = "Two variants have the same size and colour.";
  }

  // SKU and barcode uniqueness, within the form and against the database.
  const keptVariantIds = plannedVariants.flatMap((variant) =>
    variant.id === undefined ? [] : [variant.id],
  );
  const typedSkus = plannedVariants.map((variant) => variant.sku).filter(Boolean);
  for (const sku of duplicateKeys(typedSkus)) {
    errors[`variants.${plannedVariants.findLastIndex((variant) => variant.sku === sku)}.sku`] =
      "SKU used twice in this form.";
  }
  const takenSkus = new Set(await findTakenSkus(typedSkus, keptVariantIds));
  const barcodes = plannedVariants
    .map((variant) => variant.barcode)
    .filter((value): value is string => value !== null);
  for (const barcode of duplicateKeys(barcodes)) {
    errors[
      `variants.${plannedVariants.findLastIndex((variant) => variant.barcode === barcode)}.barcode`
    ] = "Barcode used twice in this form.";
  }
  const takenBarcodes = new Set(await findTakenBarcodes(barcodes, keptVariantIds));
  plannedVariants.forEach((variant, index) => {
    if (takenSkus.has(variant.sku))
      errors[`variants.${index}.sku`] = "This SKU is already used by another variant.";
    if (variant.barcode !== null && takenBarcodes.has(variant.barcode)) {
      errors[`variants.${index}.barcode`] = "This barcode is already used by another variant.";
    }
  });

  if (isNew && primary !== undefined && primary.code === null) {
    errors.categoryId =
      "This category has no code yet. Set one (e.g. SH) on the category page first.";
  }

  // --- images -------------------------------------------------------------------
  const existingImages = new Map((existing?.images ?? []).map((image) => [image.id, image]));
  const plannedImages: PlannedImage[] = [];
  input.images.forEach((image, index) => {
    const colourRef = image.colourRef ?? null;
    if (colourRef !== null && values.get(colourRef)?.type !== "COLOUR") {
      errors[`images.${index}.colourRef`] = "Choose one of this product's colours.";
    }
    if (image.id !== undefined) {
      if (!existingImages.has(image.id)) errors[`images.${index}`] = "This image no longer exists.";
      plannedImages.push({ id: image.id, altEn: image.altEn, altBn: image.altBn, colourRef });
      return;
    }
    const upload = image.upload;
    if (upload === undefined || !verifyUploadToken(upload)) {
      errors[`images.${index}`] = "This upload could not be verified. Upload the image again.";
      return;
    }
    plannedImages.push({
      create: {
        url: upload.url,
        storageProvider: upload.provider,
        storageKey: upload.key,
        width: upload.width,
        height: upload.height,
        bytes: upload.bytes,
        format: upload.format,
      },
      altEn: image.altEn,
      altBn: image.altBn,
      colourRef,
    });
  });
  const keptImageIds = new Set(
    plannedImages.flatMap((image) => (image.id === undefined ? [] : [image.id])),
  );
  const removedImages = [...existingImages.values()].filter((image) => !keptImageIds.has(image.id));

  if (Object.keys(errors).length > 0) throw invalid(errors);

  // --- save -----------------------------------------------------------------------
  const keptIds = new Set(keptVariantIds);
  const archiveVariantIds = [...existingVariants.keys()].filter(
    (variantId) => !keptIds.has(variantId),
  );

  let saved;
  try {
    saved = await saveProductGraph({
      ...(input.id === undefined
        ? {}
        : { productId: input.id, expectedVersion: input.version ?? -1 }),
      ...(isNew && primary?.code != null
        ? { newProductCode: { prefix: settings.productCodePrefix, categoryCode: primary.code } }
        : {}),
      skuPattern: settings.skuPattern,
      scalars: scalarsFrom(input),
      extraCategoryIds: input.extraCategoryIds,
      tagIds: [...new Set(input.tagIds)],
      optionValues: [...values.values()].map((value) => value.planned),
      variants: plannedVariants,
      archiveVariantIds,
      images: plannedImages,
      removeImageIds: removedImages.map((image) => image.id),
    });
  } catch (error) {
    mapSaveError(error);
  }

  // --- after commit: audit and storage clean-up --------------------------------
  await recordAudit({
    actorUserId: actor.userId,
    action: isNew ? AUDIT_ACTIONS.productCreated : AUDIT_ACTIONS.productUpdated,
    entityType: "product",
    entityId: saved.id,
    after: {
      slug: saved.slug,
      code: saved.code,
      variants: plannedVariants.length,
      archivedVariants: archiveVariantIds.length,
      images: plannedImages.length,
    },
    meta,
  });
  if (priceChanges.length > 0) {
    await recordAudit({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.priceChanged,
      entityType: "product",
      entityId: saved.id,
      before: priceChanges.map((change) => ({ sku: change.sku, ...change.before })),
      after: priceChanges.map((change) => ({ sku: change.sku, ...change.after })),
      meta,
    });
  }
  if (removedImages.length > 0) {
    await deleteStoredFiles(
      removedImages.map((image) => ({ provider: image.storageProvider, key: image.storageKey })),
    );
  }

  const affectedSlugs = [saved.slug];
  if (existing !== null && existing.slug !== saved.slug) affectedSlugs.push(existing.slug);
  return { id: saved.id, slug: saved.slug, version: saved.version, affectedSlugs };
}

// ---------------------------------------------------------------------------
// copy-only edits and drafts (Content Editor)
// ---------------------------------------------------------------------------

function assertCanEditCopy(actor: StaffContext) {
  if (!hasAnyPermission(actor, ["catalog.write", "catalog.content"])) {
    assertPermission(actor, "catalog.content");
  }
}

export async function saveProductCopy(
  actor: StaffContext,
  rawInput: unknown,
  meta: RequestMeta,
): Promise<SavedProduct> {
  assertCanEditCopy(actor);
  const parsed = productContentSchema.safeParse(rawInput);
  if (!parsed.success) throw invalid(fieldErrorsFrom(parsed.error.issues));
  const input: ProductContentInput = parsed.data;

  const existing = await findProductForEdit(input.id);
  if (existing === null) throw new AppError("NOT_FOUND", "Product not found.");
  const imageIds = new Set(existing.images.map((image) => image.id));
  const errors: Record<string, string> = {};
  input.images.forEach((image, index) => {
    if (!imageIds.has(image.id)) errors[`images.${index}`] = "This image no longer exists.";
  });
  if (Object.keys(errors).length > 0) throw invalid(errors);

  let saved;
  try {
    saved = await saveProductContent({
      productId: input.id,
      expectedVersion: input.version,
      data: {
        nameEn: input.nameEn,
        nameBn: input.nameBn,
        summaryEn: input.summaryEn,
        summaryBn: input.summaryBn,
        descriptionEn: paragraphs(input.descriptionEn),
        descriptionBn: paragraphs(input.descriptionBn),
        fabricEn: input.fabricEn,
        fabricBn: input.fabricBn,
        careEn: lines(input.careEn),
        careBn: lines(input.careBn),
        seoTitleEn: input.seoTitleEn,
        seoTitleBn: input.seoTitleBn,
        seoDescriptionEn: input.seoDescriptionEn,
        seoDescriptionBn: input.seoDescriptionBn,
      },
      images: input.images,
    });
  } catch (error) {
    mapSaveError(error);
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.productUpdated,
    entityType: "product",
    entityId: saved.id,
    after: { copyOnly: true },
    meta,
  });
  return { id: saved.id, slug: saved.slug, version: saved.version, affectedSlugs: [saved.slug] };
}

export async function createProductDraft(
  actor: StaffContext,
  rawInput: unknown,
  meta: RequestMeta,
): Promise<SavedProduct> {
  assertCanEditCopy(actor);
  const parsed = productDraftSchema.safeParse(rawInput);
  if (!parsed.success) throw invalid(fieldErrorsFrom(parsed.error.issues));
  const input = parsed.data;

  const settings = await getCatalogSettings();
  const [category] = await findCategoriesByIds([input.categoryId]);
  const errors: Record<string, string> = {};
  if (category === undefined) errors.categoryId = "Choose a category.";
  if (await isProductSlugTaken(input.slug)) errors.slug = "This slug is already used.";
  if (Object.keys(errors).length > 0) throw invalid(errors);

  let saved;
  try {
    saved = await createDraftProduct({
      scalars: {
        slug: input.slug,
        categoryId: input.categoryId,
        nameEn: input.nameEn,
        nameBn: input.nameBn,
        summaryEn: input.summaryEn,
        summaryBn: input.summaryBn,
        descriptionEn: paragraphs(input.descriptionEn),
        descriptionBn: paragraphs(input.descriptionBn),
        fabricEn: input.fabricEn,
        fabricBn: input.fabricBn,
        careEn: lines(input.careEn),
        careBn: lines(input.careBn),
        seoTitleEn: input.seoTitleEn,
        seoTitleBn: input.seoTitleBn,
        seoDescriptionEn: input.seoDescriptionEn,
        seoDescriptionBn: input.seoDescriptionBn,
      },
      newProductCode:
        category?.code == null
          ? null
          : { prefix: settings.productCodePrefix, categoryCode: category.code },
    });
  } catch (error) {
    mapSaveError(error);
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.productCreated,
    entityType: "product",
    entityId: saved.id,
    after: { slug: saved.slug, code: saved.code, draftOnly: true },
    meta,
  });
  return { id: saved.id, slug: saved.slug, version: saved.version, affectedSlugs: [] };
}

// ---------------------------------------------------------------------------
// publish, archive, back to draft (single and bulk)
// ---------------------------------------------------------------------------

export interface StatusChangeResult {
  productId: string;
  slug: string | null;
  ok: boolean;
  /** Human-readable reasons when `ok` is false. */
  reasons: string[];
  missing: PublishRequirement[];
}

export async function changeProductStatus(
  actor: StaffContext,
  rawInput: unknown,
  meta: RequestMeta,
): Promise<StatusChangeResult[]> {
  assertPermission(actor, "catalog.publish");
  const parsed = productStatusChangeSchema.safeParse(rawInput);
  if (!parsed.success) throw invalid(fieldErrorsFrom(parsed.error.issues));
  const { productIds, status } = parsed.data;

  const products = new Map(
    (await findProductsForStatusChange(productIds)).map((row) => [row.id, row]),
  );
  const results: StatusChangeResult[] = [];

  for (const productId of [...new Set(productIds)]) {
    const product = products.get(productId);
    if (product === undefined) {
      results.push({
        productId,
        slug: null,
        ok: false,
        reasons: ["Product not found."],
        missing: [],
      });
      continue;
    }
    if (product.status === status) {
      results.push({ productId, slug: product.slug, ok: true, reasons: [], missing: [] });
      continue;
    }

    if (status === "PUBLISHED") {
      const missing = missingForPublish({
        nameEn: product.nameEn,
        nameBn: product.nameBn,
        imageCount: product._count.images,
        variants: product.variants.map((variant) => ({ ...variant, deleted: false })),
      });
      if (missing.length > 0) {
        results.push({
          productId,
          slug: product.slug,
          ok: false,
          missing,
          reasons: missing.map(
            (requirement) => `Missing: ${PUBLISH_REQUIREMENT_LABELS[requirement]}`,
          ),
        });
        continue;
      }
    }

    await updateProductStatus(
      productId,
      status,
      status === "PUBLISHED" && product.publishedAt === null ? new Date() : undefined,
    );
    await recordAudit({
      actorUserId: actor.userId,
      action:
        status === "PUBLISHED"
          ? AUDIT_ACTIONS.productPublished
          : status === "ARCHIVED"
            ? AUDIT_ACTIONS.productArchived
            : AUDIT_ACTIONS.productUnpublished,
      entityType: "product",
      entityId: productId,
      before: { status: product.status },
      after: { status },
      meta,
    });
    results.push({ productId, slug: product.slug, ok: true, reasons: [], missing: [] });
  }
  return results;
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

/**
 * Only a draft that no order has ever used can be deleted (soft delete). A
 * product with order history can only be archived, so reports and invoices
 * keep their references.
 */
export async function deleteProduct(actor: StaffContext, productId: string, meta: RequestMeta) {
  assertPermission(actor, "catalog.delete");
  const [product] = await findProductsForStatusChange([productId]);
  if (product === undefined) throw new AppError("NOT_FOUND", "Product not found.");
  if (product.status !== "DRAFT") {
    throw new AppError("CONFLICT", "Only draft products can be deleted. Archive it instead.");
  }
  if ((await countOrderLinesForProduct(productId)) > 0) {
    throw new AppError("CONFLICT", "This product appears on orders, so it can only be archived.");
  }

  const files = await softDeleteProduct(productId);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.productDeleted,
    entityType: "product",
    entityId: productId,
    before: { slug: product.slug, status: product.status },
    meta,
  });
  // Storage clean-up never blocks or undoes the database change.
  await deleteStoredFiles(
    files.map((file) => ({ provider: file.storageProvider, key: file.storageKey })),
  );
  return { slug: product.slug };
}
