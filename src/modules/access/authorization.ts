/**
 * Authorization rules — pure functions, no database and no request context.
 *
 * Every mutating service calls these with the acting staff member's context,
 * so the rules are enforced on the server no matter which page, Server Action
 * or API route triggered the work (master spec section 7). Keeping them pure
 * makes them cheap to unit test.
 */
import { AppError } from "@/lib/errors";
import { isPermissionKey, type PermissionKey } from "./permissions";

/** Everything the server knows about the signed-in staff member. */
export interface StaffContext {
  userId: string;
  email: string;
  name: string | null;
  roleId: string;
  roleName: string;
  permissions: readonly PermissionKey[];
  /** True when the role grants every location. */
  allLocations: boolean;
  /** Explicitly assigned locations (ignored when `allLocations`). */
  locationIds: readonly string[];
  /** Database id of the current session — an identifier, not a credential. */
  sessionId: string;
  sessionExpiresAt: string;
}

/** Drop unknown keys a database row may contain. */
export function toPermissionKeys(raw: readonly string[]): PermissionKey[] {
  return raw.filter(isPermissionKey);
}

export function hasPermission(staff: StaffContext, permission: PermissionKey): boolean {
  return staff.permissions.includes(permission);
}

export function hasAnyPermission(
  staff: StaffContext,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.some((permission) => hasPermission(staff, permission));
}

export function canAccessLocation(staff: StaffContext, locationId: string): boolean {
  return staff.allLocations || staff.locationIds.includes(locationId);
}

/** Throws FORBIDDEN unless the staff member holds the permission. */
export function assertPermission(staff: StaffContext, permission: PermissionKey): void {
  if (!hasPermission(staff, permission)) {
    throw new AppError("FORBIDDEN", `Missing permission ${permission}`, {
      messageKey: "errors.forbidden",
      details: { permission },
    });
  }
}

/** Throws LOCATION_FORBIDDEN unless the staff member may act on the location. */
export function assertLocationAccess(staff: StaffContext, locationId: string): void {
  if (!canAccessLocation(staff, locationId)) {
    throw new AppError("LOCATION_FORBIDDEN", "Location is outside this staff member's access", {
      messageKey: "errors.locationForbidden",
      details: { locationId },
    });
  }
}

/**
 * The location filter every repository query must apply (spec section 4.6):
 * `undefined` means "all locations", otherwise only the listed ids. An empty
 * list is valid and means the staff member sees no location-scoped data.
 */
export function locationScope(staff: StaffContext): readonly string[] | undefined {
  return staff.allLocations ? undefined : staff.locationIds;
}

/** Narrow a requested set of locations to the ones the staff member may see. */
export function restrictToAccessibleLocations(
  staff: StaffContext,
  requested: readonly string[],
): string[] {
  return requested.filter((locationId) => canAccessLocation(staff, locationId));
}
