"use server";

import { revalidatePath, updateTag } from "next/cache";

import { isAppError } from "@/lib/errors";
import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { CATALOG_TAGS } from "../cache-tags";
import { catalogActionError } from "../catalog-action-error";
import type { CatalogActionResult } from "../catalog-action-state";
import { attachBulkImages } from "./product-images.service";
import {
  applyImportChunk,
  applyProductImport,
  cancelProductImport,
  checkProductImport,
} from "./product-import.service";

/**
 * Product import and bulk images (Phase 12). The services check permissions
 * and validate; these only read the request and refresh the storefront tags.
 */

function refreshProducts(slugs: readonly string[]) {
  for (const slug of new Set(slugs)) updateTag(CATALOG_TAGS.product(slug));
  updateTag(CATALOG_TAGS.lists);
  revalidatePath("/admin/products");
}

export async function checkImportAction(
  formData: FormData,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const actor = await requireStaffAction("catalog.import");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Choose a CSV or Excel file.", fieldErrors: {} };
    }
    const created = await checkProductImport(
      actor,
      { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      await getRequestMeta(),
    );
    return { status: "success", message: "File checked.", data: { id: created.id } };
  } catch (error) {
    return catalogActionError(error);
  }
}

export interface ApplyProgress {
  applied: number;
  skipped: number;
  done: boolean;
  /** Good-only mode: totals so far and the number of products planned. */
  totalApplied?: number;
  totalSkipped?: number;
  total?: number;
}

export async function applyImportAction(payload: {
  importId: string;
  mode: "ALL_OR_NOTHING" | "GOOD_ONLY";
  confirmDuplicate: boolean;
}): Promise<CatalogActionResult<ApplyProgress>> {
  try {
    const actor = await requireStaffAction("catalog.import");
    const meta = await getRequestMeta();
    const options = { confirmDuplicate: payload.confirmDuplicate === true };
    if (payload.mode === "GOOD_ONLY") {
      const result = await applyImportChunk(actor, String(payload.importId), options, meta);
      refreshProducts(result.slugs);
      return {
        status: "success",
        message: result.done ? "Import finished." : "Saving…",
        data: {
          applied: result.applied,
          skipped: result.skipped,
          done: result.done,
          totalApplied: result.totals.applied,
          totalSkipped: result.totals.skipped,
          total: result.total,
        },
      };
    }
    const result = await applyProductImport(actor, String(payload.importId), options, meta);
    refreshProducts(result.slugs);
    return {
      status: "success",
      message: "Import finished.",
      data: { applied: result.applied, skipped: 0, done: true },
    };
  } catch (error) {
    const result = catalogActionError(error);
    if (
      result.status === "error" &&
      isAppError(error) &&
      error.details?.reason === "duplicate_file"
    ) {
      return { ...result, fieldErrors: { duplicate: result.message } };
    }
    return result;
  }
}

export async function cancelImportAction(importId: string): Promise<CatalogActionResult> {
  try {
    const actor = await requireStaffAction("catalog.import");
    await cancelProductImport(actor, String(importId));
    revalidatePath("/admin/products/import");
    return { status: "success", message: "Import stopped.", data: undefined };
  } catch (error) {
    return catalogActionError(error);
  }
}

export async function attachBulkImagesAction(
  payload: unknown,
): Promise<CatalogActionResult<{ imageCount: number; publishable: boolean }>> {
  try {
    const actor = await requireStaffAction("catalog.write");
    const result = await attachBulkImages(actor, payload, await getRequestMeta());
    refreshProducts([result.slug]);
    return {
      status: "success",
      message: "Images saved.",
      data: { imageCount: result.imageCount, publishable: result.publishable },
    };
  } catch (error) {
    return catalogActionError(error);
  }
}
