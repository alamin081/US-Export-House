import { AppError } from "@/lib/errors";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import {
  countOtherActiveSuperAdmins,
  createStaffWithAccess,
  deleteSessionsForUser,
  findActiveRoleById,
  findStaffById,
  findStaffForLogin,
  findUserIdByEmail,
  listActiveLocations,
  listActiveRoles,
  listStaffWithAccess,
  replaceStaffAccess,
  updatePasswordHash,
  updateStaffActive,
} from "./access.repository";
import type {
  ChangeOwnPasswordInput,
  CreateStaffInput,
  ResetStaffPasswordInput,
  SetStaffActiveInput,
  UpdateStaffAccessInput,
} from "./access.schema";
import { assertPermission, toPermissionKeys, type StaffContext } from "./authorization";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "./password";
import { SUPER_ADMIN_ROLE, type PermissionKey } from "./permissions";

/**
 * Staff and role management. Every function takes the acting staff member
 * explicitly and checks `staff.manage` itself, so the rule holds whichever
 * page, action or API calls it — and the functions are testable without a
 * request.
 *
 * Safety rules enforced here:
 *   - only holders of `staff.manage` (Super Admin) manage staff;
 *   - nobody changes their own role, status or password through these tools,
 *     which rules out accidental self-lock-out;
 *   - the last active Super Admin can never be demoted or deactivated;
 *   - deactivating someone or resetting their password ends their sessions;
 *   - passwords are hashed with Argon2id and never returned or logged.
 */

function validationError(message: string, details: Record<string, unknown>) {
  return new AppError("VALIDATION_FAILED", message, { details });
}

function assertPasswordAcceptable(password: string, email: string) {
  const problems = checkPasswordPolicy(password, email);
  if (problems.length > 0) {
    throw validationError("Password does not meet the policy.", { field: "password", problems });
  }
}

/**
 * Branch-scoped roles need at least one location; all-location roles ignore
 * the list. Returns the location ids to store.
 */
async function resolveLocationAssignment(
  role: { allLocations: boolean },
  locationIds: readonly string[],
): Promise<string[]> {
  if (role.allLocations) return [];

  const unique = [...new Set(locationIds)];
  if (unique.length === 0) {
    throw validationError("Choose at least one location for this role.", {
      field: "locationIds",
    });
  }

  const found = await listActiveLocations(unique);
  if (found.length !== unique.length) {
    throw validationError("One or more locations are unknown or inactive.", {
      field: "locationIds",
    });
  }
  return unique;
}

async function requireRole(roleId: string) {
  const role = await findActiveRoleById(roleId);
  if (role === null) {
    throw validationError("Choose a valid role.", { field: "roleId" });
  }
  return role;
}

async function requireStaffTarget(userId: string) {
  const target = await findStaffById(userId);
  if (target === null) {
    throw new AppError("NOT_FOUND", "Staff member not found.");
  }
  return target;
}

function assertNotSelf(actor: StaffContext, userId: string, message: string) {
  if (actor.userId === userId) {
    throw new AppError("CONFLICT", message, { details: { reason: "self_change" } });
  }
}

async function assertAnotherSuperAdminRemains(targetUserId: string) {
  const others = await countOtherActiveSuperAdmins(targetUserId, SUPER_ADMIN_ROLE);
  if (others === 0) {
    throw new AppError("CONFLICT", "At least one active Super Admin must remain.", {
      details: { reason: "last_super_admin" },
    });
  }
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

export async function getStaffOverview(actor: StaffContext) {
  assertPermission(actor, "staff.manage");

  const [staff, roles, locations] = await Promise.all([
    listStaffWithAccess(),
    listActiveRoles(),
    listActiveLocations(),
  ]);

  return {
    staff: staff.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      isActive: member.isActive,
      // Expose only whether a password exists, never the hash.
      hasPassword: member.passwordHash !== null,
      lastLogin: member.lastLogin,
      createdAt: member.createdAt,
      role: member.role,
      locations: member.locationAccess.map((access) => access.location),
      activeSessions: member._count.sessions,
      isSelf: member.id === actor.userId,
    })),
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: toPermissionKeys(role.permissions) as PermissionKey[],
      allLocations: role.allLocations,
      isSystem: role.isSystem,
      staffCount: role._count.users,
    })),
    locations,
  };
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

export async function createStaff(actor: StaffContext, input: CreateStaffInput, meta: RequestMeta) {
  assertPermission(actor, "staff.manage");
  assertPasswordAcceptable(input.password, input.email);

  if ((await findUserIdByEmail(input.email)) !== null) {
    throw new AppError("CONFLICT", "An account with this email already exists.", {
      details: { field: "email" },
    });
  }

  const role = await requireRole(input.roleId);
  const locationIds = await resolveLocationAssignment(role, input.locationIds);

  const created = await createStaffWithAccess({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    roleId: role.id,
    locationIds,
  });

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.staffCreated,
    entityType: "user",
    entityId: created.id,
    after: { name: created.name, email: created.email, role: role.name, locationIds },
    meta,
  });

  return created;
}

export async function updateStaffAccess(
  actor: StaffContext,
  input: UpdateStaffAccessInput,
  meta: RequestMeta,
) {
  assertPermission(actor, "staff.manage");
  assertNotSelf(actor, input.userId, "You cannot change your own role or locations.");

  const target = await requireStaffTarget(input.userId);
  const role = await requireRole(input.roleId);
  const locationIds = await resolveLocationAssignment(role, input.locationIds);

  const losesSuperAdmin = target.role?.name === SUPER_ADMIN_ROLE && role.name !== SUPER_ADMIN_ROLE;
  if (losesSuperAdmin) await assertAnotherSuperAdminRemains(target.id);

  await replaceStaffAccess({ userId: target.id, roleId: role.id, locationIds });

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.staffAccessChanged,
    entityType: "user",
    entityId: target.id,
    before: {
      role: target.role?.name ?? null,
      locationIds: target.locationAccess.map((access) => access.locationId),
    },
    after: { role: role.name, locationIds },
    meta,
  });
}

export async function setStaffActive(
  actor: StaffContext,
  input: SetStaffActiveInput,
  meta: RequestMeta,
) {
  assertPermission(actor, "staff.manage");
  assertNotSelf(actor, input.userId, "You cannot deactivate your own account.");

  const target = await requireStaffTarget(input.userId);
  if (target.isActive === input.active) return;

  if (!input.active && target.role?.name === SUPER_ADMIN_ROLE) {
    await assertAnotherSuperAdminRemains(target.id);
  }

  await updateStaffActive(target.id, input.active);
  const endedSessions = input.active ? 0 : await deleteSessionsForUser(target.id);

  await recordAudit({
    actorUserId: actor.userId,
    action: input.active ? AUDIT_ACTIONS.staffReactivated : AUDIT_ACTIONS.staffDeactivated,
    entityType: "user",
    entityId: target.id,
    before: { isActive: target.isActive },
    after: { isActive: input.active, endedSessions },
    meta,
  });
}

export async function resetStaffPassword(
  actor: StaffContext,
  input: ResetStaffPasswordInput,
  meta: RequestMeta,
) {
  assertPermission(actor, "staff.manage");
  assertNotSelf(actor, input.userId, "Use “Change password” for your own account.");

  const target = await requireStaffTarget(input.userId);
  assertPasswordAcceptable(input.password, target.email ?? "");

  await updatePasswordHash(target.id, await hashPassword(input.password));
  const endedSessions = await deleteSessionsForUser(target.id);

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.staffPasswordReset,
    entityType: "user",
    entityId: target.id,
    after: { endedSessions },
    meta,
  });
}

export async function revokeStaffSessions(
  actor: StaffContext,
  input: { userId: string },
  meta: RequestMeta,
) {
  assertPermission(actor, "staff.manage");
  const target = await requireStaffTarget(input.userId);

  // Revoking your own sessions keeps the one you are using.
  const keep = target.id === actor.userId ? actor.sessionId : undefined;
  const endedSessions = await deleteSessionsForUser(target.id, keep);

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.sessionsRevoked,
    entityType: "user",
    entityId: target.id,
    after: { endedSessions },
    meta,
  });

  return endedSessions;
}

/** Any signed-in staff member may change their own password. */
export async function changeOwnPassword(
  actor: StaffContext,
  input: ChangeOwnPasswordInput,
  meta: RequestMeta,
) {
  const account = await findStaffForLogin(actor.email);
  if (account === null || account.passwordHash === null || account.id !== actor.userId) {
    throw new AppError("UNAUTHENTICATED", "Sign in again to continue.");
  }

  if (!(await verifyPassword(account.passwordHash, input.currentPassword))) {
    throw validationError("Your current password is not correct.", { field: "currentPassword" });
  }

  const problems = checkPasswordPolicy(input.newPassword, actor.email);
  if (problems.length > 0) {
    throw validationError("Password does not meet the policy.", {
      field: "newPassword",
      problems,
    });
  }
  if (await verifyPassword(account.passwordHash, input.newPassword)) {
    throw validationError("Choose a password you have not used just now.", {
      field: "newPassword",
    });
  }

  await updatePasswordHash(actor.userId, await hashPassword(input.newPassword));
  // Other devices must sign in again with the new password.
  const endedSessions = await deleteSessionsForUser(actor.userId, actor.sessionId);

  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.passwordChanged,
    entityType: "user",
    entityId: actor.userId,
    after: { endedOtherSessions: endedSessions },
    meta,
  });
}
