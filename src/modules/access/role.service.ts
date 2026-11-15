import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import {
  createRoleRecord,
  findRoleByName,
  findRoleForEdit,
  listActiveRoles,
  softDeleteRole,
  updateRoleRecord,
} from "./access.repository";
import { hasPermission, toPermissionKeys, type StaffContext } from "./authorization";
import {
  isPermissionKey,
  PERMISSIONS,
  SUPER_ADMIN_ONLY,
  SUPER_ADMIN_ROLE,
  type PermissionKey,
} from "./permissions";

/**
 * Editing roles and their permissions (Phase 12).
 *
 *   - only a Super Admin (role.manage AND the Super Admin role) may do it;
 *   - the Super Admin role itself is never edited: it always holds every
 *     permission the code defines;
 *   - nobody edits the role they hold (no self-promotion, no lock-out);
 *   - only permission keys the code knows are stored;
 *   - system roles keep their name and location scope (the code relies on
 *     them) but their permissions may change; custom roles can be created,
 *     copied, renamed and deleted while no staff member holds them.
 *
 * Permissions are read from the database on every request, so a change
 * applies from the affected staff's next click.
 */

function forbidden(message: string): AppError {
  return new AppError("FORBIDDEN", message, { messageKey: "errors.forbidden" });
}

function invalid(message: string, field?: string): AppError {
  return new AppError("VALIDATION_FAILED", message, {
    details: field === undefined ? {} : { field },
  });
}

export function canManageRoles(staff: StaffContext): boolean {
  return hasPermission(staff, "role.manage") && staff.roleName === SUPER_ADMIN_ROLE;
}

function assertRoleAdmin(staff: StaffContext) {
  if (!canManageRoles(staff)) throw forbidden("Only a Super Admin can edit roles.");
}

export async function listRolesForEdit(staff: StaffContext) {
  assertRoleAdmin(staff);
  const roles = await listActiveRoles();
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    allLocations: role.allLocations,
    staffCount: role._count.users,
    permissions:
      role.isSystem && role.name === SUPER_ADMIN_ROLE
        ? [...PERMISSIONS]
        : (toPermissionKeys(role.permissions) as PermissionKey[]),
    locked: role.isSystem && role.name === SUPER_ADMIN_ROLE,
    isOwn: role.id === staff.roleId,
  }));
}

export async function getRoleForEdit(staff: StaffContext, roleId: string) {
  assertRoleAdmin(staff);
  const role = await findRoleForEdit(roleId);
  if (role === null) throw new AppError("NOT_FOUND", "Role not found.");
  return {
    ...role,
    permissions: toPermissionKeys(role.permissions) as PermissionKey[],
    /** Keys in the database the code no longer knows (shown, never saved). */
    unknownKeys: role.permissions.filter((key) => !isPermissionKey(key)),
    locked: role.isSystem && role.name === SUPER_ADMIN_ROLE,
    isOwn: role.id === staff.roleId,
    updatedAt: role.updatedAt.toISOString(),
    staffCount: role._count.users,
  };
}

const permissionList = z
  .array(z.string())
  .max(PERMISSIONS.length)
  .transform((keys, context) => {
    const unknown = keys.filter((key) => !isPermissionKey(key));
    if (unknown.length > 0) {
      context.addIssue({ code: "custom", message: `Unknown permission ${unknown[0]}.` });
      return z.NEVER;
    }
    return [...new Set(keys as PermissionKey[])].sort();
  });

const roleInput = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(60),
  description: z.string().trim().max(200).optional().default(""),
  permissions: permissionList,
  allLocations: z.boolean().default(false),
});

function checkPermissions(keys: readonly PermissionKey[]) {
  const reserved = keys.filter((key) => SUPER_ADMIN_ONLY.includes(key));
  if (reserved.length > 0) {
    throw invalid(`${reserved.join(", ")} belongs to the Super Admin role only.`, "permissions");
  }
}

async function assertNameFree(name: string, exceptId?: string) {
  if (name.toLowerCase() === SUPER_ADMIN_ROLE.toLowerCase()) {
    throw invalid("That name is reserved.", "name");
  }
  const existing = await findRoleByName(name);
  if (existing !== null && existing.id !== exceptId)
    throw invalid("A role with that name exists.", "name");
}

export async function createRole(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertRoleAdmin(staff);
  const input = parseInput(roleInput, raw);
  checkPermissions(input.permissions);
  await assertNameFree(input.name);
  const created = await createRoleRecord({
    name: input.name,
    description: input.description === "" ? null : input.description,
    permissions: [...input.permissions],
    allLocations: input.allLocations,
  });
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.roleCreated,
    entityType: "role",
    entityId: created.id,
    after: { name: input.name, permissions: input.permissions, allLocations: input.allLocations },
    meta,
  });
  return created;
}

const updateInput = roleInput.extend({ updatedAt: z.string().min(1) });

function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(issue?.message ?? "Check the form.", issue?.path[0]?.toString());
  }
  return parsed.data;
}

export async function updateRole(
  staff: StaffContext,
  roleId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertRoleAdmin(staff);
  const role = await findRoleForEdit(roleId);
  if (role === null) throw new AppError("NOT_FOUND", "Role not found.");
  if (role.isSystem && role.name === SUPER_ADMIN_ROLE) {
    throw forbidden("The Super Admin role always has every permission and cannot be edited.");
  }
  if (role.id === staff.roleId) throw forbidden("You cannot change your own role.");
  const input = parseInput(updateInput, raw);
  checkPermissions(input.permissions);
  if (!role.isSystem) await assertNameFree(input.name, role.id);
  const saved = await updateRoleRecord(role.id, new Date(input.updatedAt), {
    // System roles keep their name and scope: the code relies on them.
    ...(role.isSystem ? {} : { name: input.name, allLocations: input.allLocations }),
    description: input.description === "" ? null : input.description,
    permissions: [...input.permissions],
  });
  if (!saved) {
    throw new AppError(
      "CONFLICT",
      "Someone else changed this role meanwhile. Reload and try again.",
    );
  }
  const before = toPermissionKeys(role.permissions);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.roleUpdated,
    entityType: "role",
    entityId: role.id,
    before: { name: role.name, permissions: before, allLocations: role.allLocations },
    after: {
      name: role.isSystem ? role.name : input.name,
      permissions: input.permissions,
      allLocations: role.isSystem ? role.allLocations : input.allLocations,
      added: input.permissions.filter((key) => !before.includes(key)),
      removed: before.filter((key) => !input.permissions.includes(key)),
    },
    meta,
  });
}

export async function deleteRole(staff: StaffContext, roleId: string, meta: RequestMeta) {
  assertRoleAdmin(staff);
  const role = await findRoleForEdit(roleId);
  if (role === null) throw new AppError("NOT_FOUND", "Role not found.");
  if (role.isSystem) throw invalid("System roles cannot be deleted.");
  if (role._count.users > 0) {
    throw invalid(`${role._count.users} staff account(s) still use this role. Move them first.`);
  }
  await softDeleteRole(role.id, role.name);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.roleDeleted,
    entityType: "role",
    entityId: role.id,
    before: { name: role.name, permissions: role.permissions },
    meta,
  });
}
