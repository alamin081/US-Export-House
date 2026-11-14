import { assertPermission, type StaffContext } from "@/modules/access/authorization";
import { insertAuditLog, listRecentAuditLogs } from "./audit.repository";
import { AUDIT_ACTIONS, type AuditAction } from "./audit-actions";
import { sanitizeForAudit } from "./sanitize";

/**
 * Audit trail for sensitive actions (master spec section 7): sign-ins, staff
 * and role changes, and, from later phases, price changes, stock adjustments,
 * transfers, refunds and setting changes.
 */

export { AUDIT_ACTIONS, type AuditAction };

/** Where a request came from. Collected once per request by the caller. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  locationId?: string | null;
  before?: unknown;
  after?: unknown;
  meta: RequestMeta;
}

function toJson(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return sanitizeForAudit(value);
}

/**
 * Writes one audit row. Payloads are always passed through the redactor, so
 * passwords, hashes and tokens never reach the table.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await insertAuditLog({
    userId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    locationId: entry.locationId ?? null,
    before: toJson(entry.before),
    after: toJson(entry.after),
    ip: entry.meta.ip,
    userAgent: entry.meta.userAgent?.slice(0, 300) ?? null,
  });
}

export async function listAuditLog(actor: StaffContext, limit = 100) {
  assertPermission(actor, "audit.view");
  return listRecentAuditLogs(Math.min(Math.max(limit, 1), 500));
}
