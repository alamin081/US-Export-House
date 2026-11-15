import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import {
  auditCsvPages,
  auditExportStarted,
  type AuditCsvRow,
} from "@/modules/audit/audit-log.service";
import { csvStream, type CsvColumn } from "@/modules/reports/report-csv";

/**
 * The audit log as CSV (audit.export), with the page's filters, streamed in
 * pages of 1,000. Phone numbers are masked; the export is itself audited.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<AuditCsvRow>[] = [
  { header: "When (Bangladesh)", kind: "datetime", value: (row) => row.createdAt },
  { header: "By", kind: "text", value: (row) => row.staff },
  { header: "Action", kind: "text", value: (row) => row.action },
  { header: "Record type", kind: "text", value: (row) => row.entityType },
  { header: "Record id", kind: "text", value: (row) => row.entityId },
  { header: "IP", kind: "text", value: (row) => row.ip },
  { header: "Before", kind: "text", value: (row) => row.before },
  { header: "After", kind: "text", value: (row) => row.after },
];

export async function GET(request: Request) {
  const guard = await requireStaffApi("audit.export");
  if ("response" in guard) return guard.response;
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    await auditExportStarted(guard.staff, query, requestMetaFromHeaders(request.headers));
    const date = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(csvStream(COLUMNS, auditCsvPages(guard.staff, query)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit-log_${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.httpStatus, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
