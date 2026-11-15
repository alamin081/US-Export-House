"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { isAppError } from "@/lib/errors";
import { STOCK_TAG } from "@/modules/inventory/stock-cache";
import {
  closeDay,
  findBill,
  getHeldBills,
  holdBill,
  openDay,
  resumeHeldBill,
  sell,
  setOwnPin,
  type SaleResult,
} from "./pos.service";

/** Till actions: each one checks the permission and the location again in the service. */

export async function openDayAction(payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("pos.day.manage");
    const day = await openDay(staff, payload, await getRequestMeta());
    revalidatePath("/admin/pos");
    return { status: "success", message: `Day ${day.reference} opened.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function closeDayAction(sessionId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("pos.day.manage");
    const closed = await closeDay(staff, sessionId, payload, await getRequestMeta());
    revalidatePath("/admin/pos");
    revalidatePath(`/admin/pos/day/${sessionId}`);
    return { status: "success", message: `Day ${closed.reference} closed.` };
  } catch (error) {
    return actionError(error);
  }
}

export type SellResult =
  | { status: "success"; sale: SaleResult }
  | { status: "error"; message: string; field?: string; needsApproval?: boolean };

export async function sellAction(payload: unknown): Promise<SellResult> {
  try {
    const staff = await requireStaffAction("pos.sell");
    const sale = await sell(staff, payload, await getRequestMeta());
    if (!sale.reused) updateTag(STOCK_TAG);
    return { status: "success", sale };
  } catch (error) {
    if (isAppError(error) && error.details?.needsApproval === true) {
      return { status: "error", message: error.message, field: "approval", needsApproval: true };
    }
    const result = actionError(error);
    return result.status === "error"
      ? {
          status: "error",
          message: result.message,
          ...(result.field === undefined ? {} : { field: result.field }),
        }
      : { status: "error", message: "Something went wrong." };
  }
}

export async function holdBillAction(payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("pos.sell");
    await holdBill(staff, payload);
    return { status: "success", message: "Bill held." };
  } catch (error) {
    return actionError(error);
  }
}

export async function listHeldBillsAction(sessionId: string) {
  const staff = await requireStaffAction("pos.sell");
  const bills = await getHeldBills(staff, sessionId);
  return bills.map((bill) => ({
    id: bill.id,
    label: bill.label,
    createdAt: bill.createdAt.toISOString(),
  }));
}

export async function resumeHeldBillAction(sessionId: string, billId: string) {
  const staff = await requireStaffAction("pos.sell");
  const bill = await resumeHeldBill(staff, sessionId, billId);
  return bill.cart as Record<string, unknown>;
}

export async function setOwnPinAction(payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("pos.discount.override");
    await setOwnPin(staff, payload, await getRequestMeta());
    return { status: "success", message: "Till PIN saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function findBillAction(
  text: string,
): Promise<{ orderId: string } | { error: string }> {
  try {
    const staff = await requireStaffAction("pos.sell");
    return await findBill(staff, text);
  } catch (error) {
    return { error: isAppError(error) ? error.message : "Not found." };
  }
}
