import { describe, expect, it } from "vitest";

import { ADMIN_NAV, navForPermissions } from "@/app/admin/(dashboard)/admin-nav";
import {
  isPermissionKey,
  PERMISSION_GROUPS,
  PERMISSIONS,
  SUPER_ADMIN_ROLE,
  SYSTEM_ROLES,
  type PermissionKey,
} from "@/modules/access/permissions";

function role(name: string) {
  const found = SYSTEM_ROLES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`role ${name} missing`);
  return found;
}

describe("system roles", () => {
  it("defines exactly the seven roles from the spec", () => {
    expect(SYSTEM_ROLES.map((r) => r.name)).toEqual([
      "Super Admin",
      "Store Manager",
      "Branch Manager",
      "Branch Sales Staff",
      "Order Staff",
      "Inventory Staff",
      "Content Editor",
    ]);
  });

  it("gives Super Admin every permission and every location", () => {
    const superAdmin = role(SUPER_ADMIN_ROLE);
    expect([...superAdmin.permissions].sort()).toEqual([...PERMISSIONS].sort());
    expect(superAdmin.allLocations).toBe(true);
  });

  it("lets only Super Admin manage staff", () => {
    const holders = SYSTEM_ROLES.filter((r) => r.permissions.includes("staff.manage"));
    expect(holders.map((r) => r.name)).toEqual([SUPER_ADMIN_ROLE]);
  });

  it("keeps settings and staff out of Store Manager's reach", () => {
    const manager = role("Store Manager");
    expect(manager.permissions).not.toContain("staff.manage");
    expect(manager.permissions).not.toContain("settings.write");
    expect(manager.permissions).toContain("order.refund");
  });

  it("scopes branch roles to assigned locations", () => {
    for (const name of ["Branch Manager", "Branch Sales Staff", "Order Staff", "Inventory Staff"]) {
      expect(role(name).allLocations).toBe(false);
    }
  });

  it("lets sales staff sell but not refund, adjust stock or see reports", () => {
    const sales = role("Branch Sales Staff");
    expect(sales.permissions).toContain("pos.sell");
    for (const denied of [
      "order.refund",
      "inventory.adjust",
      "report.view",
      "audit.view",
    ] as const) {
      expect(sales.permissions).not.toContain(denied);
    }
  });

  it("keeps money and stock away from Content Editor and Inventory Staff", () => {
    const editor = role("Content Editor");
    for (const denied of ["order.read", "order.refund", "inventory.adjust", "pos.sell"] as const) {
      expect(editor.permissions).not.toContain(denied);
    }
    const inventory = role("Inventory Staff");
    for (const denied of ["order.read", "order.refund", "pos.sell"] as const) {
      expect(inventory.permissions).not.toContain(denied);
    }
  });

  it("only uses known permission keys", () => {
    for (const r of SYSTEM_ROLES) {
      for (const key of r.permissions) expect(isPermissionKey(key)).toBe(true);
    }
    expect(isPermissionKey("staff.delete_everything")).toBe(false);
  });

  it("lists every permission exactly once in the matrix groups", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.keys);
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});

describe("admin navigation", () => {
  it("only references known permission keys", () => {
    for (const item of ADMIN_NAV) {
      if (item.permission !== undefined) expect(isPermissionKey(item.permission)).toBe(true);
    }
  });

  it("shows sales staff only the sections their role covers", () => {
    const items = navForPermissions(role("Branch Sales Staff").permissions as PermissionKey[]);
    const labels = items.map((item) => item.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("In-store sale");
    expect(labels).not.toContain("Staff & roles");
    expect(labels).not.toContain("Settings");
    expect(labels).not.toContain("Audit log");
  });

  it("shows Super Admin everything", () => {
    const items = navForPermissions(role(SUPER_ADMIN_ROLE).permissions as PermissionKey[]);
    expect(items.length).toBe(ADMIN_NAV.length);
  });
});

describe("catalogue permissions (Phase 6)", () => {
  const CATALOG = [
    "catalog.read",
    "catalog.write",
    "catalog.content",
    "catalog.price.write",
    "catalog.publish",
    "catalog.delete",
  ] as const;

  it("gives Super Admin and Store Manager every catalogue permission", () => {
    for (const name of ["Super Admin", "Store Manager"]) {
      for (const key of CATALOG) expect(role(name).permissions).toContain(key);
    }
  });

  it("lets Content Editors edit copy only: no prices, variants, publishing or deleting", () => {
    const editor = role("Content Editor");
    expect(editor.permissions).toContain("catalog.read");
    expect(editor.permissions).toContain("catalog.content");
    for (const denied of [
      "catalog.write",
      "catalog.price.write",
      "catalog.publish",
      "catalog.delete",
    ] as const) {
      expect(editor.permissions).not.toContain(denied);
    }
  });

  it("gives branch, order and inventory roles read-only catalogue access", () => {
    for (const name of ["Branch Manager", "Branch Sales Staff", "Order Staff", "Inventory Staff"]) {
      const catalogue = role(name).permissions.filter((key) => key.startsWith("catalog."));
      expect(catalogue).toEqual(["catalog.read"]);
    }
  });

  it("no longer knows the Phase 5 product.* and category.* keys", () => {
    for (const legacy of ["product.read", "product.write", "category.write"]) {
      expect(isPermissionKey(legacy)).toBe(false);
    }
  });
});
