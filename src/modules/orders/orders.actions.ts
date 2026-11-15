"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { STOCK_TAG } from "@/modules/inventory/stock-cache";
import { recordCodSettlement } from "./cod-settlement.service";
import {
  markDelivered,
  markDeliveryFailed,
  markPacked,
  receiveReturnedParcel,
  shipOrder,
  shipOrders,
  startPacking,
  unpackOrder,
  type BulkShipResult,
} from "./fulfilment.service";
import { changeFulfilmentLocation, correctAddress, editOrder } from "./order-edit.service";
import {
  addCustomerNoteForStaff,
  addOrderNoteForStaff,
  cancelOrder,
  confirmOrder,
  logCall,
  type CallResult,
} from "./orders.service";

/**
 * Order processing actions. Each one checks the permission again in the
 * service (and the order's location), runs in one transaction and writes an
 * audit row. Next.js checks the Origin header on every Server Action.
 */

/** Storefront availability changes when reservations or stock change. */
function updateStockCache() {
  updateTag(STOCK_TAG);
}

function refresh(orderId?: string) {
  revalidatePath("/admin/orders");
  if (orderId !== undefined) revalidatePath(`/admin/orders/${orderId}`);
}

export async function logCallAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult & { call?: CallResult }> {
  try {
    const staff = await requireStaffAction("order.confirm");
    const call = await logCall(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return {
      status: "success",
      message: call.confirmed
        ? "Call logged and the order is confirmed."
        : call.unreachable
          ? "Call logged. The customer is now marked unreachable — decide whether to cancel."
          : "Call logged.",
      call,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmOrderAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.confirm");
    const confirmed = await confirmOrder(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: `${confirmed.orderNumber} confirmed.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelOrderAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.cancel");
    const cancelled = await cancelOrder(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    updateStockCache();
    return { status: "success", message: `${cancelled.orderNumber} cancelled; stock released.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function editOrderAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult & { remindCustomer?: boolean; couponRemoved?: boolean }> {
  try {
    const staff = await requireStaffAction("order.edit");
    const result = await editOrder(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    updateStockCache();
    return {
      status: "success",
      message: result.remindCustomer
        ? `Saved. The total changed from ৳${result.oldTotalPoisha / 100} to ৳${result.newTotalPoisha / 100} — tell the customer.`
        : "Saved.",
      remindCustomer: result.remindCustomer,
      couponRemoved: result.couponRemoved,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeLocationAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.edit");
    const result = await changeFulfilmentLocation(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    updateStockCache();
    return { status: "success", message: `Now ships from ${result.locationCode}.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function correctAddressAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.edit");
    const result = await correctAddress(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return {
      status: "success",
      message:
        result.invoice === null
          ? "Address corrected."
          : `Address corrected; invoice ${result.invoice.number} is now version ${result.invoice.version}.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function startPackingAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    await startPacking(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Packing started." };
  } catch (error) {
    return actionError(error);
  }
}

export async function unpackOrderAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    await unpackOrder(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Back to confirmed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function markPackedAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    await markPacked(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Packing complete." };
  } catch (error) {
    return actionError(error);
  }
}

export async function shipOrderAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    const result = await shipOrder(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    updateStockCache();
    return {
      status: "success",
      message: `Shipped.${result.invoiceNumber === null ? "" : ` Invoice ${result.invoiceNumber}.`}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function shipOrdersAction(
  payload: unknown,
): Promise<ActionResult & { results?: BulkShipResult }> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    const results = await shipOrders(staff, payload, await getRequestMeta());
    refresh();
    updateStockCache();
    const failed = results.filter((result) => !result.ok).length;
    return {
      status: failed === results.length ? "error" : "success",
      message:
        failed === 0
          ? `${results.length} order(s) shipped.`
          : `${results.length - failed} shipped, ${failed} not shipped (see below).`,
      results,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function markDeliveredAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    await markDelivered(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Marked delivered." };
  } catch (error) {
    return actionError(error);
  }
}

export async function markDeliveryFailedAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    await markDeliveryFailed(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Marked as a failed delivery." };
  } catch (error) {
    return actionError(error);
  }
}

export async function receiveReturnedParcelAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.fulfil");
    const result = await receiveReturnedParcel(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    updateStockCache();
    return {
      status: "success",
      message: `Parcel received: ${result.good} back in stock, ${result.damaged} written off.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function addOrderNoteAction(orderId: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("order.read");
    await addOrderNoteForStaff(staff, orderId, payload, await getRequestMeta());
    refresh(orderId);
    return { status: "success", message: "Note added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function addCustomerNoteAction(
  orderId: string,
  payload: unknown,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("customer.read");
    await addCustomerNoteForStaff(staff, orderId, payload, await getRequestMeta());
    revalidatePath(`/admin/customers/${orderId}`);
    return { status: "success", message: "Note added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordCodSettlementAction(
  payload: unknown,
): Promise<ActionResult & { recorded?: boolean }> {
  try {
    const staff = await requireStaffAction("order.cod.reconcile");
    const result = await recordCodSettlement(staff, payload, await getRequestMeta());
    revalidatePath("/admin/orders/cod");
    refresh();
    const warnings = [
      result.differencePoisha === 0
        ? null
        : `The courier's total differs by ৳${result.differencePoisha / 100} — check it.`,
      result.shortOrders === 0
        ? null
        : `${result.shortOrders} order(s) were paid short and stay unpaid.`,
    ].filter(Boolean);
    return {
      status: warnings.length > 0 ? "error" : "success",
      message: `${result.reference} recorded: ${result.paidOrders} order(s) paid.${warnings.length > 0 ? ` ${warnings.join(" ")}` : ""}`,
      recorded: true,
    };
  } catch (error) {
    return actionError(error);
  }
}
