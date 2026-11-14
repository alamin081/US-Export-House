import { NextResponse } from "next/server";

import { requireStaffApi } from "@/modules/access/api-guard";
import { STOCK_CSV_TEMPLATE } from "@/modules/inventory/inventory.service";

/** The stock CSV template (UTF-8 with BOM so Excel keeps Bengali text). */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaffApi("inventory.receive");
  if ("response" in guard) return guard.response;
  return new NextResponse(`﻿${STOCK_CSV_TEMPLATE}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="stock-import-template.csv"',
      "cache-control": "no-store",
    },
  });
}
