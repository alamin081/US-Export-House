import { AppError } from "@/lib/errors";
import { assertPermission, type StaffContext } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { deleteStoredFiles, verifyUploadToken } from "@/modules/media/media.service";
import { getCatalogSettings } from "@/modules/settings/settings.service";
import {
  brandSchema,
  categorySchema,
  fieldErrorsFrom,
  optionPresetSchema,
  sizeChartSchema,
  tagSchema,
} from "./catalog.schema";
import { buildTree, checkCategoryMove, type MoveProblem, type TreeNode } from "./category-tree";
import { tagSearchText, normalizeAliases } from "./search-text";
import {
  countLiveChildCategories,
  countProductsForBrand,
  countProductsInCategory,
  countSizeChartUsage,
  createCategory,
  deleteSizeChart,
  findBrand,
  findCategory,
  findPresetByCode,
  findSizeChart,
  isBrandSlugTaken,
  isCategoryCodeTaken,
  isCategorySlugTaken,
  isTagSlugTaken,
  listBrands,
  listCategoryRows,
  listOptionPresets,
  listSizeCharts,
  listTags,
  nextCategorySortOrder,
  productSlugsForTag,
  softDeleteBrand,
  softDeleteCategory,
  updateCategory,
  upsertBrand,
  upsertOptionPreset,
  upsertSizeChart,
  upsertTag,
  writeCategoryOrder,
} from "./taxonomy.repository";

/**
 * Categories (a tree, max depth from settings), brands, option presets, tags
 * and size charts. Structure changes are audited; anything still in use by a
 * product is deactivated rather than deleted.
 */

function invalid(fieldErrors: Record<string, string>): AppError {
  return new AppError("VALIDATION_FAILED", "Check the highlighted fields.", {
    details: { fieldErrors },
  });
}

function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
  },
  raw: unknown,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid(fieldErrorsFrom(parsed.error.issues));
  return parsed.data;
}

const MOVE_MESSAGES: Record<MoveProblem, string> = {
  self_parent: "A category cannot be its own parent.",
  cycle: "A category cannot move under one of its own sub-categories.",
  too_deep: "That would make the category tree deeper than allowed.",
  unknown_parent: "Unknown parent category.",
};

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export async function getCategoryTree(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  const [rows, settings] = await Promise.all([listCategoryRows(), getCatalogSettings()]);
  return { tree: buildTree(rows), maxDepth: settings.maxCategoryDepth, rows };
}

export async function getCategory(actor: StaffContext, categoryId: string) {
  assertPermission(actor, "catalog.read");
  const category = await findCategory(categoryId);
  if (category === null) throw new AppError("NOT_FOUND", "Category not found.");
  return category;
}

export async function saveCategory(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(actor, "catalog.write");
  const input = parse(categorySchema, raw);
  const isNew = input.id === undefined;
  const existing = isNew ? null : await findCategory(input.id ?? "");
  if (!isNew && existing === null) throw new AppError("NOT_FOUND", "Category not found.");

  const errors: Record<string, string> = {};
  if (await isCategorySlugTaken(input.slug, input.id)) errors.slug = "This slug is already used.";
  if (input.code !== null && (await isCategoryCodeTaken(input.code, input.id))) {
    errors.code = "This code is already used by another category.";
  }
  if (existing?.code != null && input.code !== existing.code) {
    errors.code = "The code is part of existing product codes and SKUs, so it cannot change.";
  }

  const parentId = input.parentId ?? null;
  const rows = await listCategoryRows();
  const settings = await getCatalogSettings();
  const nodes = new Map<string, TreeNode>(rows.map((row) => [row.id, row]));
  const problem = checkCategoryMove(input.id ?? null, parentId, nodes, settings.maxCategoryDepth);
  if (problem !== null) errors.parentId = MOVE_MESSAGES[problem];

  if (input.imageUpload !== undefined && !verifyUploadToken(input.imageUpload)) {
    errors.imageUpload = "This upload could not be verified. Upload the image again.";
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);

  const image =
    input.imageUpload !== undefined
      ? { imageUrl: input.imageUpload.url, imageStorageKey: input.imageUpload.key }
      : input.removeImage
        ? { imageUrl: null, imageStorageKey: null }
        : {};

  const data = {
    slug: input.slug,
    code: input.code,
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    taglineEn: input.taglineEn,
    taglineBn: input.taglineBn,
    descriptionEn: input.descriptionEn,
    descriptionBn: input.descriptionBn,
    seoTitleEn: input.seoTitleEn,
    seoTitleBn: input.seoTitleBn,
    seoDescriptionEn: input.seoDescriptionEn,
    seoDescriptionBn: input.seoDescriptionBn,
    parentId,
    sizeChartId: input.sizeChartId ?? null,
    isActive: input.isActive,
    ...image,
  };

  const saved =
    existing === null
      ? await createCategory({ ...data, sortOrder: await nextCategorySortOrder(parentId) })
      : await updateCategory(existing.id, {
          ...data,
          // Moving to another parent puts the category last among its new siblings.
          ...(existing.parentId === parentId
            ? {}
            : { sortOrder: await nextCategorySortOrder(parentId) }),
        });

  const moved = existing !== null && existing.parentId !== parentId;
  await recordAudit({
    actorUserId: actor.userId,
    action: isNew
      ? AUDIT_ACTIONS.categoryCreated
      : moved
        ? AUDIT_ACTIONS.categoryMoved
        : AUDIT_ACTIONS.categoryUpdated,
    entityType: "category",
    entityId: saved.id,
    before:
      existing === null
        ? null
        : { parentId: existing.parentId, isActive: existing.isActive, slug: existing.slug },
    after: { parentId, isActive: input.isActive, slug: input.slug },
    meta,
  });

  const replacedImage =
    existing !== null &&
    (input.imageUpload !== undefined || input.removeImage) &&
    existing.imageStorageKey !== null;
  if (replacedImage) {
    await deleteStoredFiles([
      { provider: providerOfKey(existing.imageStorageKey), key: existing.imageStorageKey },
    ]);
  }
  return saved;
}

/** Category and brand images keep only the key; the provider follows from its shape. */
function providerOfKey(key: string | null): string | null {
  if (key === null) return null;
  return key.includes("/") ? "cloudinary" : "local-mock";
}

/** Moves a category one place up or down among its siblings. */
export async function moveCategoryInOrder(
  actor: StaffContext,
  input: { categoryId: string; direction: "up" | "down" },
  meta: RequestMeta,
) {
  assertPermission(actor, "catalog.write");
  const rows = await listCategoryRows();
  const target = rows.find((row) => row.id === input.categoryId);
  if (target === undefined) throw new AppError("NOT_FOUND", "Category not found.");

  const siblings = rows
    .filter((row) => row.parentId === target.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  const index = siblings.findIndex((row) => row.id === target.id);
  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return;

  const ordered = siblings.map((row) => row.id);
  [ordered[index], ordered[swapWith]] = [ordered[swapWith] ?? "", ordered[index] ?? ""];
  await writeCategoryOrder(ordered);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.categoryReordered,
    entityType: "category",
    entityId: target.id,
    before: { order: siblings.map((row) => row.slug) },
    after: { order: ordered.map((id) => rows.find((row) => row.id === id)?.slug) },
    meta,
  });
}

/**
 * Deletes (soft) a category with no products and no sub-categories. A
 * category with products can only be deactivated.
 */
export async function deleteCategory(actor: StaffContext, categoryId: string, meta: RequestMeta) {
  assertPermission(actor, "catalog.delete");
  const category = await findCategory(categoryId);
  if (category === null) throw new AppError("NOT_FOUND", "Category not found.");
  if ((await countProductsInCategory(categoryId)) > 0) {
    throw new AppError(
      "CONFLICT",
      "This category has products. Deactivate it instead of deleting.",
    );
  }
  if ((await countLiveChildCategories(categoryId)) > 0) {
    throw new AppError("CONFLICT", "Move or delete its sub-categories first.");
  }
  await softDeleteCategory(categoryId);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.categoryDeleted,
    entityType: "category",
    entityId: categoryId,
    before: { slug: category.slug, parentId: category.parentId },
    meta,
  });
  return { slug: category.slug };
}

// ---------------------------------------------------------------------------
// brands
// ---------------------------------------------------------------------------

export async function getBrands(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  return listBrands();
}

export async function getBrand(actor: StaffContext, brandId: string) {
  assertPermission(actor, "catalog.read");
  const brand = await findBrand(brandId);
  if (brand === null) throw new AppError("NOT_FOUND", "Brand not found.");
  return brand;
}

export async function saveBrand(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(actor, "catalog.write");
  const input = parse(brandSchema, raw);
  const existing = input.id === undefined ? null : await findBrand(input.id);
  if (input.id !== undefined && existing === null)
    throw new AppError("NOT_FOUND", "Brand not found.");

  const errors: Record<string, string> = {};
  if (await isBrandSlugTaken(input.slug, input.id)) errors.slug = "This slug is already used.";
  if (input.logoUpload !== undefined && !verifyUploadToken(input.logoUpload)) {
    errors.logoUpload = "This upload could not be verified. Upload the logo again.";
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);

  const logo =
    input.logoUpload !== undefined
      ? { logoUrl: input.logoUpload.url, logoStorageKey: input.logoUpload.key }
      : input.removeLogo
        ? { logoUrl: null, logoStorageKey: null }
        : {};
  const saved = await upsertBrand(input.id, {
    slug: input.slug,
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    descriptionEn: input.descriptionEn,
    descriptionBn: input.descriptionBn,
    isActive: input.isActive,
    ...logo,
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: existing === null ? AUDIT_ACTIONS.brandCreated : AUDIT_ACTIONS.brandUpdated,
    entityType: "brand",
    entityId: saved.id,
    after: { slug: input.slug, isActive: input.isActive },
    meta,
  });
  if (existing?.logoStorageKey != null && (input.logoUpload !== undefined || input.removeLogo)) {
    await deleteStoredFiles([
      { provider: providerOfKey(existing.logoStorageKey), key: existing.logoStorageKey },
    ]);
  }
  return saved;
}

export async function deleteBrand(actor: StaffContext, brandId: string, meta: RequestMeta) {
  assertPermission(actor, "catalog.delete");
  const brand = await findBrand(brandId);
  if (brand === null) throw new AppError("NOT_FOUND", "Brand not found.");
  if ((await countProductsForBrand(brandId)) > 0) {
    throw new AppError("CONFLICT", "This brand has products. Deactivate it instead of deleting.");
  }
  await softDeleteBrand(brandId);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.brandDeleted,
    entityType: "brand",
    entityId: brandId,
    before: { slug: brand.slug },
    meta,
  });
}

// ---------------------------------------------------------------------------
// option presets
// ---------------------------------------------------------------------------

export async function getOptionPresets(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  return listOptionPresets();
}

export async function saveOptionPreset(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(actor, "catalog.write");
  const input = parse(optionPresetSchema, raw);
  const clash = await findPresetByCode(input.type, input.group, input.code);
  if (clash !== null && clash.id !== input.id) {
    throw invalid({ code: `Code ${input.code} is already used in the ${input.group} group.` });
  }
  const saved = await upsertOptionPreset(input.id, {
    type: input.type,
    group: input.group,
    code: input.code,
    valueEn: input.valueEn,
    valueBn: input.valueBn,
    hex: input.type === "COLOUR" ? input.hex : null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.optionPresetSaved,
    entityType: "option_preset",
    entityId: saved.id,
    after: { type: input.type, group: input.group, code: input.code, isActive: input.isActive },
    meta,
  });
  return saved;
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export async function getTags(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  return listTags();
}

/** Tags are copy as much as structure, so Content Editors may manage them too. */
export async function saveTag(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  if (!actor.permissions.includes("catalog.content")) assertPermission(actor, "catalog.write");
  const input = parse(tagSchema, raw);
  if (await isTagSlugTaken(input.slug, input.id))
    throw invalid({ slug: "This slug is already used." });
  const aliases = normalizeAliases(input.aliases);
  const saved = await upsertTag(input.id, {
    slug: input.slug,
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    aliases,
    searchText: tagSearchText({ nameEn: input.nameEn, nameBn: input.nameBn, aliases }),
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.tagSaved,
    entityType: "tag",
    entityId: saved.id,
    after: { slug: input.slug, aliases },
    meta,
  });
  return { ...saved, affectedSlugs: await productSlugsForTag(saved.id) };
}

// ---------------------------------------------------------------------------
// size charts
// ---------------------------------------------------------------------------

export async function getSizeCharts(actor: StaffContext) {
  assertPermission(actor, "catalog.read");
  return listSizeCharts();
}

export async function getSizeChart(actor: StaffContext, sizeChartId: string) {
  assertPermission(actor, "catalog.read");
  const chart = await findSizeChart(sizeChartId);
  if (chart === null) throw new AppError("NOT_FOUND", "Size chart not found.");
  return chart;
}

export async function saveSizeChart(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(actor, "catalog.write");
  const input = parse(sizeChartSchema, raw);
  if (input.id !== undefined && (await findSizeChart(input.id)) === null) {
    throw new AppError("NOT_FOUND", "Size chart not found.");
  }
  const saved = await upsertSizeChart(input.id, {
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    noteEn: input.noteEn,
    noteBn: input.noteBn,
    unit: input.unit,
    columns: input.columns.map((column) => ({
      en: column.en,
      ...(column.bn === null ? {} : { bn: column.bn }),
    })),
    rows: input.rows,
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.sizeChartSaved,
    entityType: "size_chart",
    entityId: saved.id,
    after: { nameEn: input.nameEn, rows: input.rows.length },
    meta,
  });
  return saved;
}

export async function removeSizeChart(actor: StaffContext, sizeChartId: string, meta: RequestMeta) {
  assertPermission(actor, "catalog.delete");
  if ((await countSizeChartUsage(sizeChartId)) > 0) {
    throw new AppError("CONFLICT", "This size chart is used by products or categories.");
  }
  await deleteSizeChart(sizeChartId);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.sizeChartDeleted,
    entityType: "size_chart",
    entityId: sizeChartId,
    meta,
  });
}
