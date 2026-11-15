"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { hashIp } from "@/modules/checkout/checkout.service";
import { STOCK_TAG } from "@/modules/inventory/stock-cache";
import { decideRefund, recordRefund } from "./refund.service";
import {
  approveReturn,
  closeReturn,
  createCustomerReturn,
  createStaffReturn,
  inspectReturn,
  receiveReturn,
  rejectReturn,
  type CustomerReturnResult,
} from "./returns.service";

/**
 * Return, exchange and refund actions. Staff actions check the permission
 * again in the service and are audited; the customer action is rate-limited
 * and checks the order and phone again on the server.
 */

function refresh(returnId?: string) {
  revalidatePath("/admin/returns");
  if (returnId !== undefined) revalidatePath(`/admin/returns/${returnId}`);
  revalidatePath("/admin/orders");
}

export async function createStaffReturnAction(
  payload: unknown,
): Promise<ActionResult & { id?: string }> {
  try {
    const staff = await requireStaffAction("return.manage");
    const created = await createStaffReturn(staff, payload, await getRequestMeta());
    refresh();
    return { status: "success", message: `${created.reference} created.`, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function approveReturnAction(returnId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("return.manage");
    const result = await approveReturn(staff, returnId, await getRequestMeta());
    refresh(returnId);
    if (result.exchange !== null) updateTag(STOCK_TAG);
    return {
      status: "success",
      message:
        result.exchange === null
          ? "Approved."
          : `Approved. Exchange order ${result.exchange.orderNumber} created (customer pays ৳${result.exchange.toPayPoisha / 100}).`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function rejectReturnAction(
  returnId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("return.manage");
    await rejectReturn(staff, returnId, payload, await getRequestMeta());
    refresh(returnId);
    return { status: "success", message: "Request refused." };
  } catch (error) {
    return actionError(error);
  }
}

export async function receiveReturnAction(returnId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("return.manage");
    await receiveReturn(staff, returnId, await getRequestMeta());
    refresh(returnId);
    return { status: "success", message: "Marked as received." };
  } catch (error) {
    return actionError(error);
  }
}

export async function inspectReturnAction(
  returnId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("return.manage");
    const result = await inspectReturn(staff, returnId, payload, await getRequestMeta());
    refresh(returnId);
    updateTag(STOCK_TAG);
    return {
      status: "success",
      message: `Inspected: ${result.accepted} back in stock, ${result.damaged} written off, ${result.rejected} not accepted.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function closeReturnAction(returnId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("return.manage");
    await closeReturn(staff, returnId, await getRequestMeta());
    refresh(returnId);
    return { status: "success", message: "Return closed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordRefundAction(
  returnId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("refund.record");
    const result = await recordRefund(staff, returnId, payload, await getRequestMeta());
    refresh(returnId);
    revalidatePath("/admin/refunds");
    return {
      status: "success",
      message: result.pending
        ? `Refund of ৳${result.amountPoisha / 100} is waiting for a manager's approval.`
        : `Refund of ৳${result.amountPoisha / 100} recorded.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function decideRefundAction(
  refundId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("refund.approve");
    await decideRefund(staff, refundId, payload, await getRequestMeta());
    revalidatePath("/admin/refunds");
    refresh();
    return { status: "success", message: "Saved." };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * The customer's request from the tracking page. FormData carries the
 * fields as JSON (`payload`) and up to a few photos (`photos`).
 */
export async function requestReturnAction(formData: FormData): Promise<CustomerReturnResult> {
  try {
    const meta = await getRequestMeta();
    let payload: unknown = null;
    try {
      payload = JSON.parse(String(formData.get("payload") ?? "null"));
    } catch {
      return { ok: false, error: "INVALID" };
    }
    const files = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const photos = await Promise.all(
      files.slice(0, 10).map(async (file) => ({
        declaredMime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
    return await createCustomerReturn(payload, photos, meta, hashIp(meta.ip));
  } catch (error) {
    console.error("[returns] request failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "INVALID" };
  }
}
