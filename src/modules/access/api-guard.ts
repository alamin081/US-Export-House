import "server-only";

import { NextResponse } from "next/server";

import { getCurrentStaff } from "./access.service";
import { hasPermission, type StaffContext } from "./authorization";
import type { PermissionKey } from "./permissions";

/**
 * Guard for admin Route Handlers. Returns either the staff context or a
 * ready-made 401/403 JSON response:
 *
 *   const guard = await requireStaffApi("inventory.read");
 *   if ("response" in guard) return guard.response;
 */
export async function requireStaffApi(
  permission?: PermissionKey,
): Promise<{ staff: StaffContext } | { response: NextResponse }> {
  const staff = await getCurrentStaff();

  if (staff === null) {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHENTICATED" } },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    };
  }

  if (permission !== undefined && !hasPermission(staff, permission)) {
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", permission } },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }

  return { staff };
}
