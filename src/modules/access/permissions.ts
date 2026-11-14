/**
 * Permission keys and the seven system roles.
 *
 * The keys are defined here, in code, because code is what checks them. The
 * database `Role` table stores which keys each role holds (master spec
 * section 7), and the seed builds those rows from SYSTEM_ROLES below, so the
 * two cannot drift. A key stored in the database that is not listed here is
 * ignored at runtime.
 */

export const PERMISSIONS = [
  /** View the catalogue in the admin. */
  "catalog.read",
  /** Products (except prices), variants, images, categories, brands, options, size charts. */
  "catalog.write",
  /** Copy only: names, descriptions, care, SEO, image alt text; create drafts. */
  "catalog.content",
  /** Variant prices and compare-at prices. */
  "catalog.price.write",
  /** Publish and archive products. */
  "catalog.publish",
  /** Delete draft products, categories, brands and size charts. */
  "catalog.delete",
  "inventory.read",
  "inventory.adjust",
  "transfer.create",
  "transfer.dispatch",
  "transfer.receive",
  "stockcount.manage",
  "order.read",
  "order.process",
  "order.cancel",
  "order.refund",
  "pos.sell",
  "return.manage",
  "shipment.book",
  "customer.read",
  "report.view",
  "content.write",
  "settings.write",
  "staff.manage",
  "audit.view",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

/** Human-readable grouping for the permission matrix in the admin. */
export const PERMISSION_GROUPS: ReadonlyArray<{
  label: string;
  keys: readonly PermissionKey[];
}> = [
  {
    label: "Catalogue",
    keys: [
      "catalog.read",
      "catalog.write",
      "catalog.content",
      "catalog.price.write",
      "catalog.publish",
      "catalog.delete",
    ],
  },
  {
    label: "Inventory",
    keys: [
      "inventory.read",
      "inventory.adjust",
      "transfer.create",
      "transfer.dispatch",
      "transfer.receive",
      "stockcount.manage",
    ],
  },
  {
    label: "Orders & sales",
    keys: [
      "order.read",
      "order.process",
      "order.cancel",
      "order.refund",
      "pos.sell",
      "return.manage",
      "shipment.book",
      "customer.read",
    ],
  },
  { label: "Insight", keys: ["report.view", "audit.view"] },
  { label: "Administration", keys: ["content.write", "settings.write", "staff.manage"] },
];

export const SUPER_ADMIN_ROLE = "Super Admin";

export interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
  /** True when the role sees every location without explicit assignments. */
  allLocations: boolean;
}

/**
 * The seven roles from the master spec. Only Super Admin holds
 * `staff.manage`, which is what makes "only a Super Admin can create staff
 * accounts" true.
 */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    name: SUPER_ADMIN_ROLE,
    description: "Full access to every location and every setting.",
    permissions: [...PERMISSIONS],
    allLocations: true,
  },
  {
    name: "Store Manager",
    description: "Everything operational across all locations, except staff and settings.",
    permissions: PERMISSIONS.filter((key) => key !== "staff.manage" && key !== "settings.write"),
    allLocations: true,
  },
  {
    name: "Branch Manager",
    description: "Full control of the branches assigned to them.",
    permissions: [
      "catalog.read",
      "inventory.read",
      "inventory.adjust",
      "transfer.create",
      "transfer.dispatch",
      "transfer.receive",
      "stockcount.manage",
      "order.read",
      "order.process",
      "pos.sell",
      "return.manage",
      "customer.read",
      "report.view",
    ],
    allLocations: false,
  },
  {
    name: "Branch Sales Staff",
    description: "In-store selling and stock lookup at their own branch.",
    permissions: ["catalog.read", "inventory.read", "pos.sell", "order.read", "customer.read"],
    allLocations: false,
  },
  {
    name: "Order Staff",
    description: "Processes online orders and books couriers.",
    permissions: [
      "catalog.read",
      "inventory.read",
      "order.read",
      "order.process",
      "order.cancel",
      "shipment.book",
      "return.manage",
      "customer.read",
    ],
    allLocations: false,
  },
  {
    name: "Inventory Staff",
    description: "Stock, transfers and counts; no access to orders or money.",
    permissions: [
      "catalog.read",
      "inventory.read",
      "inventory.adjust",
      "transfer.create",
      "transfer.dispatch",
      "transfer.receive",
      "stockcount.manage",
      "report.view",
    ],
    allLocations: false,
  },
  {
    name: "Content Editor",
    description: "Catalogue copy, banners and pages. No stock, orders or money.",
    permissions: ["catalog.read", "catalog.content", "content.write"],
    allLocations: true,
  },
];
