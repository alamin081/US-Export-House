import { NextResponse } from "next/server";

import { requireStaffApi } from "@/modules/access/api-guard";
import { importTemplateCsv } from "@/modules/catalog/import/product-import.service";

/** The import template: headings and two example products (refused if imported). */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaffApi("catalog.import");
  if ("response" in guard) return guard.response;
  return new NextResponse(importTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="product-import-template.csv"',
      "cache-control": "no-store",
    },
  });
}
