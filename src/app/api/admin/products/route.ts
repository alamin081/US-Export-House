import { NextResponse, type NextRequest } from "next/server";

import { requireStaffApi } from "@/modules/access/api-guard";
import { listProductsForAdmin } from "@/modules/catalog/product.service";

/** Admin product list as JSON (catalog.read). Same filters as /admin/products. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaffApi("catalog.read");
  if ("response" in guard) return guard.response;

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await listProductsForAdmin(guard.staff, query);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
