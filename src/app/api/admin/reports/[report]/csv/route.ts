import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import { csvFileName, toCsv } from "@/modules/reports/report-csv";
import { exportReportTable, isReportKey, tableCsvColumns } from "@/modules/reports/reports.service";

/**
 * One table of a report as CSV (UTF-8 with BOM for Excel), with the same
 * filters as the page. Location-scoped; cost columns exist only for staff
 * with inventory.cost.read because the service never builds them otherwise.
 * Every export is audited.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  if (!isReportKey(report)) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const guard = await requireStaffApi("report.export");
  if ("response" in guard) return guard.response;
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  try {
    const { result, table, rows } = await exportReportTable(
      guard.staff,
      report,
      query,
      url.searchParams.get("table"),
      requestMetaFromHeaders(request.headers),
    );
    const name = csvFileName(
      `${report}-${table.id}`,
      result.filters.range.fromKey,
      result.filters.range.toKey,
    );
    return new NextResponse(toCsv(tableCsvColumns(table), rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
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
