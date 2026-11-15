"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRequestMeta, requireStaffAction } from "./access.service";
import { actionError } from "./action-result";
import type { ActionResult } from "./action-state";
import { createRole, deleteRole, updateRole } from "./role.service";

/** Role editor actions (Phase 12). The service enforces Super Admin only. */

export async function saveRoleAction(
  roleId: string | null,
  payload: unknown,
): Promise<ActionResult> {
  let createdId: string | null = null;
  try {
    const staff = await requireStaffAction("role.manage");
    const meta = await getRequestMeta();
    if (roleId === null) createdId = (await createRole(staff, payload, meta)).id;
    else await updateRole(staff, roleId, payload, meta);
    revalidatePath("/admin/roles");
    revalidatePath("/admin/staff");
  } catch (error) {
    return actionError(error);
  }
  if (createdId !== null) redirect(`/admin/roles/${createdId}`);
  revalidatePath(`/admin/roles/${roleId}`);
  return {
    status: "success",
    message: "Role saved. Staff with this role get the change on their next click.",
  };
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("role.manage");
    await deleteRole(staff, roleId, await getRequestMeta());
    revalidatePath("/admin/roles");
  } catch (error) {
    return actionError(error);
  }
  redirect("/admin/roles");
}
