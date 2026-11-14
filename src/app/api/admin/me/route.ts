import { NextResponse } from "next/server";

import { requireStaffApi } from "@/modules/access/api-guard";

/**
 * The signed-in staff member's identity and access.
 * 401 without a valid session; never returns the session token.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaffApi();
  if ("response" in guard) return guard.response;

  const { staff } = guard;
  return NextResponse.json(
    {
      userId: staff.userId,
      email: staff.email,
      name: staff.name,
      role: staff.roleName,
      permissions: staff.permissions,
      allLocations: staff.allLocations,
      locationIds: staff.locationIds,
      sessionExpiresAt: staff.sessionExpiresAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
