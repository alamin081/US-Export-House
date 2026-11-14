import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { exportMatrixCsv } from "@/modules/inventory/inventory.service";

/**
 * The inventory matrix as CSV (UTF-8 with BOM, for Excel), with the same
 * filters as the page. Location-scoped; cost columns only with
 * `inventory.cost.read`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireStaffApi("inventory.read");
  if ("response" in guard) return guard.response;
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    const csv = await exportMatrixCsv(guard.staff, query);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="inventory-${date}.csv"`,
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
