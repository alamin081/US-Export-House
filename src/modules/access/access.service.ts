import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import type { RequestMeta } from "@/modules/audit/audit.service";
import { listActiveLocations } from "./access.repository";
import { hasPermission, locationScope, type StaffContext } from "./authorization";
import type { PermissionKey } from "./permissions";
import { requestMetaFromHeaders } from "./request-meta";

/**
 * Request-scoped access helpers for pages, Server Actions and API routes.
 *
 * Three layers check access (master spec section 7):
 *   1. src/proxy.ts           — cheap gate: no session cookie, no /admin.
 *   2. requireStaffPage()     — every admin page, with a permission.
 *   3. the service itself     — assertPermission / assertLocationAccess,
 *                                so a forgotten page check still fails safe.
 */

/** The validated staff member for this request, deduplicated per request. */
export const getCurrentStaff = cache(async (): Promise<StaffContext | null> => {
  const session = await auth();
  return session?.staff ?? null;
});

export async function getRequestMeta(): Promise<RequestMeta> {
  return requestMetaFromHeaders(await headers());
}

/**
 * For admin pages: sends anonymous visitors to the sign-in page and staff
 * without the permission to the 403 page.
 */
export async function requireStaffPage(permission?: PermissionKey): Promise<StaffContext> {
  const staff = await getCurrentStaff();
  if (staff === null) {
    redirect("/admin/login");
  }
  if (permission !== undefined && !hasPermission(staff, permission)) {
    redirect(`/admin/forbidden?need=${encodeURIComponent(permission)}`);
  }
  return staff;
}

/** For Server Actions: throws instead of redirecting, so the form can show it. */
export async function requireStaffAction(permission?: PermissionKey): Promise<StaffContext> {
  const staff = await getCurrentStaff();
  if (staff === null) {
    throw new AppError("UNAUTHENTICATED", "Sign in again to continue.", {
      messageKey: "errors.unauthenticated",
    });
  }
  if (permission !== undefined && !hasPermission(staff, permission)) {
    throw new AppError("FORBIDDEN", `Missing permission ${permission}`, {
      messageKey: "errors.forbidden",
      details: { permission },
    });
  }
  return staff;
}

/** The locations this staff member may see — the source for every location picker. */
export async function listAccessibleLocations(staff: StaffContext) {
  return listActiveLocations(locationScope(staff));
}
