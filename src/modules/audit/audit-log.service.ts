import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { assertPermission, type StaffContext } from "@/modules/access/authorization";
import { auditDiff, maskPhone, maskPhones } from "./audit-view";
import {
  auditFilterChoices,
  countAudit,
  findAuditEntry,
  findAuditPage,
  type AuditFilter,
} from "./audit.repository";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "./audit.service";

/**
 * The audit log viewer (Phase 12): filters, paging, a field-by-field
 * difference and CSV. Nothing here can change or remove an entry — and the
 * database refuses it anyway (append-only trigger). Phone numbers are masked
 * for everyone; secrets were redacted when the entry was written.
 */

const PAGE_SIZE = 50;
const DHAKA_MS = 6 * 60 * 60 * 1000;

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

const filterSchema = z.object({
  from: dateKey,
  to: dateKey,
  staff: z.string().max(40).optional().catch(undefined),
  action: z.string().max(80).optional().catch(undefined),
  entity: z.string().max(40).optional().catch(undefined),
  id: z.string().max(120).optional().catch(undefined),
  cursor: z.string().max(80).optional().catch(undefined),
});

function dhakaStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DHAKA_MS);
}

export function parseAuditFilter(raw: Record<string, string | undefined>): {
  filter: AuditFilter;
  cursor: { createdAt: Date; id: string } | null;
  query: Record<string, string>;
} {
  const input = filterSchema.parse(raw);
  const empty = (value: string | undefined) => (value === undefined || value === "" ? null : value);
  const filter: AuditFilter = {
    from: input.from === undefined ? null : dhakaStart(input.from),
    to: input.to === undefined ? null : new Date(dhakaStart(input.to).getTime() + 24 * 3600 * 1000),
    userId: empty(input.staff),
    action: empty(input.action),
    entityType: empty(input.entity),
    entityId: empty(input.id),
  };
  let cursor: { createdAt: Date; id: string } | null = null;
  if (input.cursor !== undefined) {
    const [time, id] = input.cursor.split("_");
    if (time !== undefined && id !== undefined && !Number.isNaN(Number(time))) {
      cursor = { createdAt: new Date(Number(time)), id };
    }
  }
  const query = Object.fromEntries(
    Object.entries({
      from: input.from,
      to: input.to,
      staff: input.staff,
      action: input.action,
      entity: input.entity,
      id: input.id,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""),
  );
  return { filter, cursor, query };
}

function present(row: Awaited<ReturnType<typeof findAuditPage>>[number]) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    staff: row.user?.name ?? row.user?.email ?? (row.userId === null ? "System" : "Removed user"),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId === null ? null : maskPhone(row.entityId),
    ip: row.ip,
  };
}

export async function listAudit(staff: StaffContext, raw: Record<string, string | undefined>) {
  assertPermission(staff, "audit.view");
  const { filter, cursor, query } = parseAuditFilter(raw);
  const [rows, total, choices] = await Promise.all([
    findAuditPage(filter, cursor, PAGE_SIZE + 1),
    countAudit(filter),
    auditFilterChoices(),
  ]);
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map(present),
    total,
    nextCursor:
      rows.length > PAGE_SIZE && last !== undefined
        ? `${last.createdAt.getTime()}_${last.id}`
        : null,
    query,
    choices: {
      actions: choices.actions,
      entityTypes: choices.entityTypes,
      staff: choices.staff.map((row) => ({ id: row.id, name: row.name ?? row.email ?? row.id })),
    },
  };
}

export async function getAuditEntry(staff: StaffContext, id: string) {
  assertPermission(staff, "audit.view");
  const row = await findAuditEntry(id);
  if (row === null) throw new AppError("NOT_FOUND", "Audit entry not found.");
  const before = maskPhones(row.before);
  const after = maskPhones(row.after);
  return {
    ...present(row),
    locationId: row.locationId,
    userAgent: row.userAgent,
    before,
    after,
    diff: auditDiff(before, after),
  };
}

export interface AuditCsvRow {
  createdAt: Date;
  staff: string;
  action: string;
  entityType: string;
  entityId: string;
  ip: string;
  before: string;
  after: string;
}

/** Every matching entry, page by page (for the streamed CSV), masked. */
export async function* auditCsvPages(staff: StaffContext, raw: Record<string, string | undefined>) {
  assertPermission(staff, "audit.export");
  const { filter } = parseAuditFilter(raw);
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const rows = await findAuditPage(filter, cursor, 1000);
    if (rows.length === 0) return;
    yield rows.map((row): AuditCsvRow => ({
      createdAt: row.createdAt,
      staff: row.user?.name ?? row.user?.email ?? (row.userId === null ? "System" : "Removed user"),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId === null ? "" : maskPhone(row.entityId),
      ip: row.ip ?? "",
      before: row.before === null ? "" : JSON.stringify(maskPhones(row.before)),
      after: row.after === null ? "" : JSON.stringify(maskPhones(row.after)),
    }));
    if (rows.length < 1000) return;
    const last = rows[rows.length - 1]!;
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}

export async function auditExportStarted(
  staff: StaffContext,
  raw: Record<string, string | undefined>,
  meta: RequestMeta,
) {
  assertPermission(staff, "audit.export");
  const { query } = parseAuditFilter(raw);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.auditExported,
    entityType: "audit",
    after: { filters: query },
    meta,
  });
}
