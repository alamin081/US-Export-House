import { NextResponse } from "next/server";

import { listAccessibleLocations } from "@/modules/access/access.service";
import { requireStaffApi } from "@/modules/access/api-guard";

/**
 * Locations the caller may work with — scoped by role and assignments
 * (master spec section 4.6). 401 without a session, 403 without
 * `inventory.read`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaffApi("inventory.read");
  if ("response" in guard) return guard.response;

  const locations = await listAccessibleLocations(guard.staff);
  return NextResponse.json({ locations }, { headers: { "cache-control": "no-store" } });
}
