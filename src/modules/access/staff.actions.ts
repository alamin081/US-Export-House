"use server";

import { revalidatePath } from "next/cache";

import {
  changeOwnPasswordSchema,
  createStaffSchema,
  resetStaffPasswordSchema,
  setStaffActiveSchema,
  staffIdSchema,
  updateStaffAccessSchema,
} from "./access.schema";
import { getRequestMeta, requireStaffAction } from "./access.service";
import { actionError, zodFailure } from "./action-result";
import type { ActionResult } from "./action-state";
import {
  changeOwnPassword,
  createStaff,
  resetStaffPassword,
  revokeStaffSessions,
  setStaffActive,
  updateStaffAccess,
} from "./staff.service";

/**
 * Staff management Server Actions: parse input with Zod, resolve the acting
 * staff member, call the service (which enforces permissions), refresh the page.
 */

const STAFF_PATH = "/admin/staff";

function locationIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("locationIds")
    .filter((value): value is string => typeof value === "string");
}

export async function createStaffAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createStaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    locationIds: locationIdsFrom(formData),
    password: formData.get("password"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction("staff.manage");
    const created = await createStaff(actor, parsed.data, await getRequestMeta());
    revalidatePath(STAFF_PATH);
    return { status: "success", message: `Created ${created.email}.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateStaffAccessAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateStaffAccessSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
    locationIds: locationIdsFrom(formData),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction("staff.manage");
    await updateStaffAccess(actor, parsed.data, await getRequestMeta());
    revalidatePath(STAFF_PATH);
    return { status: "success", message: "Access updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function setStaffActiveAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setStaffActiveSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction("staff.manage");
    await setStaffActive(actor, parsed.data, await getRequestMeta());
    revalidatePath(STAFF_PATH);
    return {
      status: "success",
      message: parsed.data.active ? "Account reactivated." : "Account deactivated.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function resetStaffPasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetStaffPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction("staff.manage");
    await resetStaffPassword(actor, parsed.data, await getRequestMeta());
    revalidatePath(STAFF_PATH);
    return { status: "success", message: "Password reset. Their sessions were ended." };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeStaffSessionsAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = staffIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction("staff.manage");
    const ended = await revokeStaffSessions(actor, parsed.data, await getRequestMeta());
    revalidatePath(STAFF_PATH);
    return { status: "success", message: `Ended ${ended} session(s).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeOwnPasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return zodFailure(parsed.error.issues);

  try {
    const actor = await requireStaffAction();
    await changeOwnPassword(actor, parsed.data, await getRequestMeta());
    return { status: "success", message: "Password changed. Other devices were signed out." };
  } catch (error) {
    return actionError(error);
  }
}
