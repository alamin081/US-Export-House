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
