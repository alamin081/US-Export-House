import "server-only";

import { db } from "@/lib/db";

/**
 * Data access for staff identity, sessions, roles and location assignments.
 * No business rules live here — only queries. Rules are in the services.
 */

const staffRoleSelect = {
  id: true,
  name: true,
  permissions: true,
  allLocations: true,
  deletedAt: true,
} as const;

// ---------------------------------------------------------------------------
// sign-in and sessions
// ---------------------------------------------------------------------------

/** The account a sign-in attempt targets. Customers never match. */
export async function findStaffForLogin(email: string) {
  return db.user.findFirst({
    where: { email, kind: "STAFF", deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      passwordHash: true,
      role: { select: staffRoleSelect },
    },
  });
}

export async function createSessionRecord(input: {
  userId: string;
  tokenHash: string;
  expires: Date;
  ip: string | null;
  userAgent: string | null;
}) {
  return db.session.create({
    data: {
      userId: input.userId,
      sessionToken: input.tokenHash,
      expires: input.expires,
      ip: input.ip,
      userAgent: input.userAgent,
    },
    select: { id: true, expires: true },
  });
}

/** Everything needed to build a StaffContext, in one round trip. */
export async function findSessionWithStaff(tokenHash: string) {
  return db.session.findUnique({
    where: { sessionToken: tokenHash },
    select: {
      id: true,
      expires: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          kind: true,
          isActive: true,
          deletedAt: true,
          role: { select: staffRoleSelect },
          locationAccess: {
            where: { location: { deletedAt: null, isActive: true } },
            select: { locationId: true },
          },
        },
      },
    },
  });
}

/** Removes one session and reports whose it was (for the audit trail). */
export async function deleteSessionByTokenHash(tokenHash: string) {
  const session = await db.session.findUnique({
    where: { sessionToken: tokenHash },
    select: { id: true, userId: true },
  });
  if (session === null) return null;
  await db.session.delete({ where: { id: session.id } });
  return session;
}

/** Removes one session by id and reports whose it was. */
export async function deleteSessionById(sessionId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true },
  });
  if (session === null) return null;
  const removed = await db.session.deleteMany({ where: { id: session.id } });
  return removed.count === 0 ? null : session;
}

export async function touchSession(sessionId: string, at: Date) {
  await db.session.updateMany({ where: { id: sessionId }, data: { lastSeenAt: at } });
}

/** Deletes sessions past their absolute expiry or idle for too long. */
export async function deleteDeadSessions(cutoffs: { expiredBefore: Date; idleSince: Date }) {
  const result = await db.session.deleteMany({
    where: {
      OR: [{ expires: { lte: cutoffs.expiredBefore } }, { lastSeenAt: { lte: cutoffs.idleSince } }],
    },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// sign-in throttling
// ---------------------------------------------------------------------------

/**
 * Atomically counts one more attempt for the key and returns the new count.
 * A row whose window has ended starts a fresh window at 1. The row lock taken
 * by ON CONFLICT serialises concurrent attempts across server instances.
 */
export async function reserveThrottleAttempt(key: string, windowSeconds: number): Promise<number> {
  const rows = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "AuthThrottle" ("key", "attempts", "windowStartedAt", "expiresAt", "updatedAt")
    VALUES (${key}, 1, now(), now() + (${windowSeconds} * interval '1 second'), now())
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthThrottle"."expiresAt" <= now() THEN 1
                        ELSE "AuthThrottle"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "AuthThrottle"."expiresAt" <= now() THEN now()
                               ELSE "AuthThrottle"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "AuthThrottle"."expiresAt" <= now() THEN EXCLUDED."expiresAt"
                         ELSE "AuthThrottle"."expiresAt" END,
      "updatedAt" = now()
    RETURNING "attempts"`;
  return Number(rows[0]?.attempts ?? 0);
}

/** Gives back one reserved attempt per key (after a successful sign-in). */
export async function releaseThrottleAttempts(keys: readonly string[]) {
  await db.authThrottle.updateMany({
    where: { key: { in: [...keys] }, attempts: { gt: 0 } },
    data: { attempts: { decrement: 1 } },
  });
}

export async function deleteExpiredThrottles(before: Date) {
  const result = await db.authThrottle.deleteMany({ where: { expiresAt: { lte: before } } });
  return result.count;
}

export async function deleteSessionsForUser(userId: string, keepSessionId?: string) {
  const result = await db.session.deleteMany({
    where: {
      userId,
      ...(keepSessionId === undefined ? {} : { id: { not: keepSessionId } }),
    },
  });
  return result.count;
}

export async function recordSuccessfulLogin(userId: string, upgradedPasswordHash?: string) {
  await db.user.update({
    where: { id: userId },
    data: {
      lastLogin: new Date(),
      ...(upgradedPasswordHash === undefined ? {} : { passwordHash: upgradedPasswordHash }),
    },
  });
}

// ---------------------------------------------------------------------------
// staff management
// ---------------------------------------------------------------------------

export async function listStaffWithAccess() {
  const now = new Date();
  return db.user.findMany({
    where: { kind: "STAFF", deletedAt: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      passwordHash: true,
      role: { select: { id: true, name: true, allLocations: true } },
      locationAccess: {
        select: { location: { select: { id: true, code: true, nameEn: true } } },
      },
      _count: { select: { sessions: { where: { expires: { gt: now } } } } },
    },
  });
}

export async function findStaffById(userId: string) {
  return db.user.findFirst({
    where: { id: userId, kind: "STAFF", deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      passwordHash: true,
      role: { select: { id: true, name: true, allLocations: true } },
      locationAccess: { select: { locationId: true } },
    },
  });
}

/** Any user with this email, staff or customer, for uniqueness checks. */
export async function findUserIdByEmail(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true } });
}

export async function createStaffWithAccess(input: {
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
  locationIds: readonly string[];
}) {
  return db.user.create({
    data: {
      kind: "STAFF",
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      roleId: input.roleId,
      isActive: true,
      locationAccess: {
        create: input.locationIds.map((locationId) => ({ locationId })),
      },
    },
    select: { id: true, email: true, name: true },
  });
}

/** Replaces the role and the full set of location assignments atomically. */
export async function replaceStaffAccess(input: {
  userId: string;
  roleId: string;
  locationIds: readonly string[];
}) {
  await db.$transaction([
    db.user.update({ where: { id: input.userId }, data: { roleId: input.roleId } }),
    db.staffLocationAccess.deleteMany({ where: { userId: input.userId } }),
    db.staffLocationAccess.createMany({
      data: input.locationIds.map((locationId) => ({ userId: input.userId, locationId })),
    }),
  ]);
}

export async function updateStaffActive(userId: string, isActive: boolean) {
  await db.user.update({ where: { id: userId }, data: { isActive } });
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** Active, password-holding Super Admins other than the given user. */
export async function countOtherActiveSuperAdmins(excludeUserId: string, superAdminRole: string) {
  return db.user.count({
    where: {
      id: { not: excludeUserId },
      kind: "STAFF",
      isActive: true,
      deletedAt: null,
      passwordHash: { not: null },
      role: { name: superAdminRole, deletedAt: null },
    },
  });
}

// ---------------------------------------------------------------------------
// roles and locations
// ---------------------------------------------------------------------------

export async function listActiveRoles() {
  return db.role.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      allLocations: true,
      isSystem: true,
      _count: { select: { users: { where: { kind: "STAFF", deletedAt: null } } } },
    },
  });
}

export async function findActiveRoleById(roleId: string) {
  return db.role.findFirst({
    where: { id: roleId, deletedAt: null },
    select: { id: true, name: true, allLocations: true },
  });
}

export async function listActiveLocations(onlyIds?: readonly string[]) {
  return db.location.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(onlyIds === undefined ? {} : { id: { in: [...onlyIds] } }),
    },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: { id: true, code: true, type: true, nameEn: true, nameBn: true },
  });
}
