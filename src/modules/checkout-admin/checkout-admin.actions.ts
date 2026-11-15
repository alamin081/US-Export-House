"use server";

import { revalidatePath } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import {
  blockCustomerPhone,
  deleteCoupon,
  mapArea,
  saveCheckoutSettings,
  saveStoreSettings,
  saveCoupon,
  saveZone,
  searchShippingAreas,
  unblockCustomerPhone,
} from "./checkout-admin.service";

/**
 * Admin actions for coupons, delivery zones, blocked phones and checkout
 * settings. Each one checks the permission again in the service and writes
 * an audit row. Next.js checks the Origin header on every Server Action.
 */

export async function saveCouponAction(
  id: string | null,
  payload: unknown,
): Promise<ActionResult & { id?: string }> {
  try {
    const staff = await requireStaffAction("coupon.manage");
    const saved = await saveCoupon(staff, id, payload, await getRequestMeta());
    revalidatePath("/admin/coupons");
    return { status: "success", message: `Coupon ${saved.code} saved.`, id: saved.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteCouponAction(id: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("coupon.manage");
    await deleteCoupon(staff, id, await getRequestMeta());
    revalidatePath("/admin/coupons");
    return { status: "success", message: "Coupon deleted." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveZoneAction(id: string, payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("shipping.manage");
    const saved = await saveZone(staff, id, payload, await getRequestMeta());
    revalidatePath("/admin/shipping");
    return { status: "success", message: `${saved.nameEn} saved.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function mapAreaAction(payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("shipping.manage");
    await mapArea(staff, payload, await getRequestMeta());
    revalidatePath("/admin/shipping");
    return { status: "success", message: "Area saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function searchAreasAction(text: string) {
  const staff = await requireStaffAction("shipping.manage");
  return searchShippingAreas(staff, text);
}

export async function saveCheckoutSettingsAction(
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction();
    await saveCheckoutSettings(staff, payload, await getRequestMeta());
    revalidatePath("/admin/checkout-settings");
    revalidatePath("/admin/shipping");
    return { status: "success", message: "Settings saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveStoreSettingsAction(
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("checkout.settings");
    await saveStoreSettings(staff, payload, await getRequestMeta());
    revalidatePath("/admin/checkout-settings");
    return { status: "success", message: "Shop details saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function blockPhoneAction(payload: unknown): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("customer.block");
    await blockCustomerPhone(staff, payload, await getRequestMeta());
    revalidatePath("/admin/blocked-phones");
    return { status: "success", message: "Number blocked." };
  } catch (error) {
    return actionError(error);
  }
}

export async function unblockPhoneAction(id: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("customer.block");
    await unblockCustomerPhone(staff, id, await getRequestMeta());
    revalidatePath("/admin/blocked-phones");
    return { status: "success", message: "Number unblocked." };
  } catch (error) {
    return actionError(error);
  }
}
