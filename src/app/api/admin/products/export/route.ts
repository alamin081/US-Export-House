import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import {
  auditProductExport,
  exportColumns,
  productExportPages,
} from "@/modules/catalog/import/product-export.service";
import { csvStream } from "@/modules/reports/report-csv";

/**
 * The catalogue as CSV in the import's columns (catalog.export), with the
 * product list's filters. Streamed; purchase cost only with permission; audited.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireStaffApi("catalog.export");
  if ("response" in guard) return guard.response;
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    await auditProductExport(guard.staff, query, requestMetaFromHeaders(request.headers));
    const date = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(
      csvStream(exportColumns(guard.staff), productExportPages(guard.staff, query)),
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="products_${date}.csv"`,
          "cache-control": "no-store",
        },
      },
    );
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
