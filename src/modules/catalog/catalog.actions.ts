"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { catalogActionError } from "./catalog-action-error";
import type { CatalogActionResult } from "./catalog-action-state";
import { CATALOG_TAGS } from "./cache-tags";
import {
  changeProductStatus,
  createProductDraft,
  deleteProduct,
  saveProduct,
  saveProductCopy,
  type StatusChangeResult,
} from "./product.service";
import {
  deleteBrand,
  deleteCategory,
  moveCategoryInOrder,
  removeSizeChart,
  saveBrand,
  saveCategory,
  saveOptionPreset,
  saveSizeChart,
  saveTag,
} from "./taxonomy.service";

/**
 * Catalogue Server Actions. Each one resolves the signed-in staff member,
 * calls the service (which enforces permissions and validates), then refreshes
 * the storefront cache tags the change touches. Next.js checks the Origin
 * header on every Server Action (CSRF protection).
 */

function refreshProducts(slugs: readonly string[]) {
  for (const slug of new Set(slugs)) updateTag(CATALOG_TAGS.product(slug));
  updateTag(CATALOG_TAGS.lists);
}

function refreshCategories() {
  updateTag(CATALOG_TAGS.categories);
  updateTag(CATALOG_TAGS.lists);
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export async function saveProductAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string; version: number }>> {
  try {
    const actor = await requireStaffAction("catalog.write");
    const saved = await saveProduct(actor, payload, await getRequestMeta());
    refreshProducts(saved.affectedSlugs);
    revalidatePath("/admin/products");
    return {
      status: "success",
      message: "Product saved.",
      data: { id: saved.id, version: saved.version },
    };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function saveProductCopyAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string; version: number }>> {
  try {
    const actor = await requireStaffAction();
    const saved = await saveProductCopy(actor, payload, await getRequestMeta());
    refreshProducts(saved.affectedSlugs);
    return {
      status: "success",
      message: "Copy saved.",
      data: { id: saved.id, version: saved.version },
    };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function createProductDraftAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string; version: number }>> {
  try {
    const actor = await requireStaffAction();
    const saved = await createProductDraft(actor, payload, await getRequestMeta());
    revalidatePath("/admin/products");
    return {
      status: "success",
      message: "Draft created.",
      data: { id: saved.id, version: saved.version },
    };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function changeProductStatusAction(payload: {
  productIds: string[];
  status: "PUBLISHED" | "ARCHIVED" | "DRAFT";
}): Promise<CatalogActionResult<StatusChangeResult[]>> {
  try {
    const actor = await requireStaffAction("catalog.publish");
    const results = await changeProductStatus(actor, payload, await getRequestMeta());
    refreshProducts(
      results.flatMap((result) => (result.ok && result.slug !== null ? [result.slug] : [])),
    );
    revalidatePath("/admin/products");
    const failed = results.filter((result) => !result.ok).length;
    return {
      status: "success",
      message:
        failed === 0
          ? `Updated ${results.length} product${results.length === 1 ? "" : "s"}.`
          : `Updated ${results.length - failed}, ${failed} could not be changed.`,
      data: results,
    };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function deleteProductAction(productId: string): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.delete");
    const { slug } = await deleteProduct(actor, productId, await getRequestMeta());
    refreshProducts([slug]);
    revalidatePath("/admin/products");
    return { status: "success", message: "Draft deleted.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

// ---------------------------------------------------------------------------
// categories, brands, presets, tags, size charts
// ---------------------------------------------------------------------------

export async function saveCategoryAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const actor = await requireStaffAction("catalog.write");
    const saved = await saveCategory(actor, payload, await getRequestMeta());
    refreshCategories();
    revalidatePath("/admin/categories");
    return { status: "success", message: "Category saved.", data: { id: saved.id } };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function moveCategoryAction(payload: {
  categoryId: string;
  direction: "up" | "down";
}): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.write");
    await moveCategoryInOrder(actor, payload, await getRequestMeta());
    refreshCategories();
    revalidatePath("/admin/categories");
    return { status: "success", message: "Order updated.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.delete");
    await deleteCategory(actor, categoryId, await getRequestMeta());
    refreshCategories();
    revalidatePath("/admin/categories");
    return { status: "success", message: "Category deleted.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function saveBrandAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const actor = await requireStaffAction("catalog.write");
    const saved = await saveBrand(actor, payload, await getRequestMeta());
    updateTag(CATALOG_TAGS.lists);
    revalidatePath("/admin/brands");
    return { status: "success", message: "Brand saved.", data: { id: saved.id } };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function deleteBrandAction(brandId: string): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.delete");
    await deleteBrand(actor, brandId, await getRequestMeta());
    updateTag(CATALOG_TAGS.lists);
    revalidatePath("/admin/brands");
    return { status: "success", message: "Brand deleted.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function saveOptionPresetAction(payload: unknown): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.write");
    await saveOptionPreset(actor, payload, await getRequestMeta());
    revalidatePath("/admin/options");
    return { status: "success", message: "Option saved.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function saveTagAction(payload: unknown): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction();
    const saved = await saveTag(actor, payload, await getRequestMeta());
    refreshProducts(saved.affectedSlugs);
    revalidatePath("/admin/tags");
    return { status: "success", message: "Tag saved.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function saveSizeChartAction(
  payload: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const actor = await requireStaffAction("catalog.write");
    const saved = await saveSizeChart(actor, payload, await getRequestMeta());
    updateTag(CATALOG_TAGS.sizeCharts);
    revalidatePath("/admin/size-charts");
    return { status: "success", message: "Size chart saved.", data: { id: saved.id } };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function deleteSizeChartAction(sizeChartId: string): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.delete");
    await removeSizeChart(actor, sizeChartId, await getRequestMeta());
    updateTag(CATALOG_TAGS.sizeCharts);
    revalidatePath("/admin/size-charts");
    return { status: "success", message: "Size chart deleted.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}
