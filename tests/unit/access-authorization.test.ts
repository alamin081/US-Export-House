import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  canAccessLocation,
  hasAnyPermission,
  hasPermission,
  locationScope,
  restrictToAccessibleLocations,
  toPermissionKeys,
  type StaffContext,
} from "@/modules/access/authorization";

function staff(overrides: Partial<StaffContext> = {}): StaffContext {
  return {
    userId: "u1",
    email: "staff@example.test",
    name: "Staff",
    roleId: "r1",
    roleName: "Branch Sales Staff",
    permissions: ["catalog.read", "pos.sell"],
    allLocations: false,
    locationIds: ["loc-gulshan"],
    sessionId: "s1",
    sessionExpiresAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("permissions", () => {
  it("grants only what the role holds", () => {
    expect(hasPermission(staff(), "pos.sell")).toBe(true);
    expect(hasPermission(staff(), "order.refund")).toBe(false);
    expect(hasAnyPermission(staff(), ["order.refund", "pos.sell"])).toBe(true);
    expect(hasAnyPermission(staff(), ["order.refund", "staff.manage"])).toBe(false);
  });

  it("throws a FORBIDDEN AppError when a permission is missing", () => {
    expect(() => assertPermission(staff(), "staff.manage")).toThrow(AppError);
    try {
      assertPermission(staff(), "staff.manage");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("FORBIDDEN");
      expect((error as AppError).httpStatus).toBe(403);
    }
    expect(() => assertPermission(staff(), "pos.sell")).not.toThrow();
  });

  it("ignores unknown permission keys stored in the database", () => {
    expect(toPermissionKeys(["pos.sell", "root.everything", "catalog.read"])).toEqual([
      "pos.sell",
      "catalog.read",
    ]);
  });
});

describe("location access", () => {
  it("limits branch staff to their assigned locations", () => {
    const branch = staff();
    expect(canAccessLocation(branch, "loc-gulshan")).toBe(true);
    expect(canAccessLocation(branch, "loc-dhanmondi")).toBe(false);
  });

  it("gives all-location roles every location", () => {
    const manager = staff({ allLocations: true, locationIds: [] });
    expect(canAccessLocation(manager, "loc-anything")).toBe(true);
    expect(locationScope(manager)).toBeUndefined();
  });

  it("throws LOCATION_FORBIDDEN outside the assignment", () => {
    try {
      assertLocationAccess(staff(), "loc-chattogram");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as AppError).code).toBe("LOCATION_FORBIDDEN");
    }
  });

  it("builds the repository filter from the assignment", () => {
    expect(locationScope(staff())).toEqual(["loc-gulshan"]);
    // No assignments means no location-scoped data, never "everything".
    expect(locationScope(staff({ locationIds: [] }))).toEqual([]);
  });

  it("narrows a requested set of locations", () => {
    expect(
      restrictToAccessibleLocations(staff(), ["loc-gulshan", "loc-dhanmondi", "loc-warehouse"]),
    ).toEqual(["loc-gulshan"]);
  });
});
