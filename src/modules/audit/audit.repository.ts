import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** Append-only access to the audit trail. There is no update or delete here. */

export interface AuditRow {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  locationId: string | null;
  /** Already sanitised, JSON-safe values (see sanitize.ts). */
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
}

export async function insertAuditLog(row: AuditRow): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      locationId: row.locationId,
      ...(row.before === null || row.before === undefined
        ? {}
        : { before: row.before as Prisma.InputJsonValue }),
      ...(row.after === null || row.after === undefined
        ? {}
        : { after: row.after as Prisma.InputJsonValue }),
      ip: row.ip,
      userAgent: row.userAgent,
    },
  });
}

export async function listRecentAuditLogs(limit: number) {
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });
}

export interface AuditFilter {
  from: Date | null;
  to: Date | null;
  userId: string | null;
  /** Exact action, or a prefix ending in "." (e.g. "order."). */
  action: string | null;
  entityType: string | null;
  entityId: string | null;
}

function auditWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    ...(filter.from === null && filter.to === null
      ? {}
      : {
          createdAt: {
            ...(filter.from === null ? {} : { gte: filter.from }),
            ...(filter.to === null ? {} : { lt: filter.to }),
          },
        }),
    ...(filter.userId === null ? {} : { userId: filter.userId }),
    ...(filter.action === null
      ? {}
      : filter.action.endsWith(".")
        ? { action: { startsWith: filter.action } }
        : { action: filter.action }),
    ...(filter.entityType === null ? {} : { entityType: filter.entityType }),
    ...(filter.entityId === null ? {} : { entityId: filter.entityId }),
  };
}

/** Newest first, keyset paging on (createdAt, id). */
export async function findAuditPage(
  filter: AuditFilter,
  cursor: { createdAt: Date; id: string } | null,
  take: number,
) {
  return db.auditLog.findMany({
    where: {
      AND: [
        auditWhere(filter),
        ...(cursor === null
          ? []
          : [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { user: { select: { email: true, name: true } } },
  });
}

export async function countAudit(filter: AuditFilter) {
  return db.auditLog.count({ where: auditWhere(filter) });
}

export async function findAuditEntry(id: string) {
  return db.auditLog.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true } } },
  });
}

export async function auditFilterChoices() {
  const [actions, entityTypes, staff] = await Promise.all([
    db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
    db.user.findMany({
      where: { kind: "STAFF" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    actions: actions.map((row) => row.action),
    entityTypes: entityTypes.map((row) => row.entityType),
    staff,
  };
}
