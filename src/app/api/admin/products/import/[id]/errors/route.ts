import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { importErrorsCsv } from "@/modules/catalog/import/product-import.service";

/** The file's problem rows with an `error` column, to fix in Excel and upload again. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaffApi("catalog.import");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    return new NextResponse(await importErrorsCsv(guard.staff, id), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="import-errors_${id.slice(-8)}.csv"`,
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
