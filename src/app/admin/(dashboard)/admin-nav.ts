import type { PermissionKey } from "@/modules/access/permissions";

/**
 * Admin navigation.
 *
 * The dashboard is English-only for now (master spec section 3.6). It is built
 * with the same primitives as the storefront, so adding `next-intl` later is a
 * matter of swapping these labels for message keys.
 *
 * `permission` hides an item from staff who cannot open it. That is a
 * convenience only: every page checks the same permission on the server.
 * `phase` records which phase delivers the real screen.
 */
export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  phase: number;
  group: "overview" | "catalogue" | "operations" | "insight" | "system";
  /** Omitted: every signed-in staff member may open it. */
  permission?: PermissionKey;
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "gauge", phase: 12, group: "overview" },

  {
    label: "Products",
    href: "/admin/products",
    icon: "shirt",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Categories",
    href: "/admin/categories",
    icon: "folder-tree",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Brands",
    href: "/admin/brands",
    icon: "badge",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Options",
    href: "/admin/options",
    icon: "palette",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Tags",
    href: "/admin/tags",
    icon: "tags",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Size charts",
    href: "/admin/size-charts",
    icon: "ruler",
    phase: 6,
    group: "catalogue",
    permission: "catalog.read",
  },
  {
    label: "Inventory",
    href: "/admin/inventory",
    icon: "boxes",
    phase: 7,
    group: "catalogue",
    permission: "inventory.read",
  },
  {
    label: "Transfers",
    href: "/admin/transfers",
    icon: "arrow-left-right",
    phase: 7,
    group: "catalogue",
    permission: "transfer.create",
  },

  {
    label: "Orders",
    href: "/admin/orders",
    icon: "receipt",
    phase: 9,
    group: "operations",
    permission: "order.read",
  },
  {
    label: "In-store sale",
    href: "/admin/pos",
    icon: "store",
    phase: 9,
    group: "operations",
    permission: "pos.sell",
  },
  {
    label: "Returns",
    href: "/admin/returns",
    icon: "rotate-ccw",
    phase: 9,
    group: "operations",
    permission: "return.manage",
  },
  {
    label: "Shipments",
    href: "/admin/shipments",
    icon: "truck",
    phase: 11,
    group: "operations",
    permission: "shipment.book",
  },
  {
    label: "Customers",
    href: "/admin/customers",
    icon: "users",
    phase: 9,
    group: "operations",
    permission: "customer.read",
  },

  {
    label: "Reports",
    href: "/admin/reports",
    icon: "chart-no-axes-column",
    phase: 12,
    group: "insight",
    permission: "report.view",
  },
  {
    label: "Audit log",
    href: "/admin/audit",
    icon: "scroll-text",
    phase: 5,
    group: "insight",
    permission: "audit.view",
  },

  {
    label: "Locations",
    href: "/admin/locations",
    icon: "map-pin",
    phase: 7,
    group: "system",
    permission: "settings.write",
  },
  {
    label: "Staff & roles",
    href: "/admin/staff",
    icon: "shield",
    phase: 5,
    group: "system",
    permission: "staff.manage",
  },
  {
    label: "Content",
    href: "/admin/content",
    icon: "layout-template",
    phase: 12,
    group: "system",
    permission: "content.write",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "settings",
    phase: 12,
    group: "system",
    permission: "settings.write",
  },
];

export const ADMIN_GROUP_LABELS: Record<AdminNavItem["group"], string> = {
  overview: "Overview",
  catalogue: "Catalogue",
  operations: "Operations",
  insight: "Insight",
  system: "System",
};

/** Nav items a staff member is allowed to open. */
export function navForPermissions(permissions: readonly PermissionKey[]): AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) => item.permission === undefined || permissions.includes(item.permission),
  );
}
