"use server";

import { revalidatePath } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { generateMissingBarcodes } from "./labels.service";

/** Fills empty barcodes only (label.print or catalog.write), audited. */
export async function generateMissingBarcodesAction(): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction();
    const assigned = await generateMissingBarcodes(staff, await getRequestMeta());
    revalidatePath("/admin/labels");
    return {
      status: "success",
      message:
        assigned.length === 0
          ? "Every variant already has a barcode."
          : `${assigned.length} barcodes generated.`,
    };
  } catch (error) {
    return actionError(error);
  }
}
