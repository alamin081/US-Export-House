"use server";

import { revalidatePath, updateTag } from "next/cache";

import { CONTENT_TAGS } from "@/modules/content/cache-tags";
import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { inventoryActionError } from "./inventory-action-error";
import type { InventoryActionResult } from "./inventory-action-state";
import {
  adjust,
  applyImport,
  previewImport,
  receive,
  setLowStockThreshold,
  type ImportPreview,
} from "./inventory.service";
import { deleteLocationForStaff, saveLocationForStaff } from "./location.service";
import {
  applyCount,
  cancelCount,
  recordCount,
  startCount,
  submitCount,
} from "./stock-count.service";
import { STOCK_TAG } from "./stock-cache";
import {
  approveTransfer,
  cancelTransfer,
  saveTransferDraft,
  transferDispatch,
  transferReceive,
} from "./transfer.service";

/**
 * Inventory Server Actions. Each resolves the signed-in staff member, calls
 * the service (which checks permission and location access itself), then
 * refreshes only the storefront stock tag — product pages are not rebuilt.
 * Next.js checks the Origin header on every Server Action (CSRF protection).
 */

function refreshStock(...paths: string[]) {
  updateTag(STOCK_TAG);
  for (const path of paths) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export async function saveLocationAction(
  payload: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  try {
    const staff = await requireStaffAction("location.manage");
    const saved = await saveLocationForStaff(staff, payload, await getRequestMeta());
    refreshStock("/admin/locations");
    // Branch details on the footer and contact page.
    updateTag(CONTENT_TAGS.branches);
    return { status: "success", message: `${saved.code} saved.`, data: { id: saved.id } };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function deleteLocationAction(id: string): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction("location.manage");
    await deleteLocationForStaff(staff, id, await getRequestMeta());
    revalidatePath("/admin/locations");
    return { status: "success", message: "Location deleted.", data: undefined };
  } catch (error) {
    return inventoryActionError(error);
  }
}

// ---------------------------------------------------------------------------
// stock
// ---------------------------------------------------------------------------

export async function adjustStockAction(
  payload: unknown,
): Promise<InventoryActionResult<{ onHand: number }>> {
  try {
    const staff = await requireStaffAction("inventory.adjust");
    const result = await adjust(staff, payload, await getRequestMeta());
    refreshStock("/admin/inventory");
    return { status: "success", message: `Saved. On hand is now ${result.onHand}.`, data: result };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function setThresholdAction(payload: unknown): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction("inventory.adjust");
    await setLowStockThreshold(staff, payload, await getRequestMeta());
    revalidatePath("/admin/inventory");
    return { status: "success", message: "Low-stock threshold saved.", data: undefined };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function receiveStockAction(
  payload: unknown,
): Promise<InventoryActionResult<{ reference: string; totalQuantity: number }>> {
  try {
    const staff = await requireStaffAction("inventory.receive");
    const receipt = await receive(staff, payload, await getRequestMeta());
    refreshStock("/admin/inventory");
    return {
      status: "success",
      message: `${receipt.reference}: ${receipt.totalQuantity} units received.`,
      data: { reference: receipt.reference, totalQuantity: receipt.totalQuantity },
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}

async function fileFrom(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return null;
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function previewImportAction(
  formData: FormData,
): Promise<InventoryActionResult<ImportPreview>> {
  try {
    const staff = await requireStaffAction("inventory.receive");
    const file = await fileFrom(formData);
    if (file === null) return { status: "error", message: "Choose a CSV file.", field: "file" };
    const preview = await previewImport(staff, { ...file, mode: formData.get("mode") });
    return { status: "success", message: "Preview ready.", data: preview };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function applyImportAction(
  formData: FormData,
): Promise<InventoryActionResult<{ reference: string; totalQuantity: number }>> {
  try {
    const staff = await requireStaffAction("inventory.receive");
    const file = await fileFrom(formData);
    if (file === null) return { status: "error", message: "Choose a CSV file.", field: "file" };
    const result = await applyImport(
      staff,
      {
        ...file,
        mode: formData.get("mode"),
        expectedSha256: String(formData.get("sha256") ?? ""),
        confirmDuplicate: formData.get("confirmDuplicate") === "true",
      },
      await getRequestMeta(),
    );
    refreshStock("/admin/inventory");
    return {
      status: "success",
      message: `${result.reference}: ${result.totalQuantity} units in ${result.lines} lines imported.`,
      data: { reference: result.reference, totalQuantity: result.totalQuantity },
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}

// ---------------------------------------------------------------------------
// transfers
// ---------------------------------------------------------------------------

export async function saveTransferDraftAction(
  payload: unknown,
): Promise<InventoryActionResult<{ id: string; reference: string }>> {
  try {
    const staff = await requireStaffAction("transfer.create");
    const saved = await saveTransferDraft(staff, payload, await getRequestMeta());
    revalidatePath("/admin/transfers");
    return { status: "success", message: `${saved.reference} saved as draft.`, data: saved };
  } catch (error) {
    return inventoryActionError(error);
  }
}

type TransferStep = "approve" | "dispatch";

export async function transferStepAction(
  step: TransferStep,
  transferId: string,
): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction(
      step === "approve" ? "transfer.approve" : "transfer.dispatch",
    );
    const meta = await getRequestMeta();
    const result =
      step === "approve"
        ? await approveTransfer(staff, transferId, meta)
        : await transferDispatch(staff, transferId, meta);
    refreshStock("/admin/transfers", `/admin/transfers/${transferId}`);
    return {
      status: "success",
      message: `${result.reference} ${result.status.toLowerCase()}.`,
      data: undefined,
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function receiveTransferAction(payload: unknown): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction("transfer.receive");
    const result = await transferReceive(staff, payload, await getRequestMeta());
    refreshStock("/admin/transfers", `/admin/transfers/${result.id}`);
    return { status: "success", message: `${result.reference} received.`, data: undefined };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function cancelTransferAction(payload: unknown): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction();
    const result = await cancelTransfer(staff, payload, await getRequestMeta());
    revalidatePath("/admin/transfers");
    revalidatePath(`/admin/transfers/${result.id}`);
    return { status: "success", message: `${result.reference} cancelled.`, data: undefined };
  } catch (error) {
    return inventoryActionError(error);
  }
}

// ---------------------------------------------------------------------------
// stock counts
// ---------------------------------------------------------------------------

export async function startCountAction(
  payload: unknown,
): Promise<InventoryActionResult<{ id: string; reference: string }>> {
  try {
    const staff = await requireStaffAction("inventory.count");
    const created = await startCount(staff, payload, await getRequestMeta());
    revalidatePath("/admin/stock-counts");
    return { status: "success", message: `${created.reference} started.`, data: created };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function recordCountAction(
  payload: unknown,
): Promise<InventoryActionResult<{ itemId: string; variantId: string; countedQty: number }>> {
  try {
    const staff = await requireStaffAction("inventory.count");
    const result = await recordCount(staff, payload);
    return {
      status: "success",
      message: `${result.sku || "Item"}: ${result.countedQty}`,
      data: result,
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function countStepAction(
  step: "submit" | "cancel",
  countId: string,
): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction();
    const meta = await getRequestMeta();
    if (step === "submit") await submitCount(staff, countId, meta);
    else await cancelCount(staff, countId, meta);
    revalidatePath("/admin/stock-counts");
    revalidatePath(`/admin/stock-counts/${countId}`);
    return {
      status: "success",
      message: step === "submit" ? "Count submitted for review." : "Count cancelled.",
      data: undefined,
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}

export async function applyCountAction(payload: unknown): Promise<InventoryActionResult> {
  try {
    const staff = await requireStaffAction("inventory.count.apply");
    const result = await applyCount(staff, payload, await getRequestMeta());
    refreshStock("/admin/stock-counts", `/admin/stock-counts/${result.id}`);
    return {
      status: "success",
      message: `Applied: ${result.corrections} correction${result.corrections === 1 ? "" : "s"}.`,
      data: undefined,
    };
  } catch (error) {
    return inventoryActionError(error);
  }
}
