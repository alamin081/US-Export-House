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
    label: "Barcode labels",
    href: "/admin/labels",
    icon: "tags",
    phase: 9,
    group: "catalogue",
    permission: "label.print",
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
    label: "Stock counts",
    href: "/admin/stock-counts",
    icon: "clipboard-check",
    phase: 7,
    group: "catalogue",
    permission: "inventory.count",
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
    label: "Courier cash",
    href: "/admin/orders/cod",
    icon: "banknote",
    phase: 9,
    group: "operations",
    permission: "order.cod.reconcile",
  },
  {
    label: "Coupons",
    href: "/admin/coupons",
    icon: "ticket-percent",
    phase: 8,
    group: "operations",
    permission: "coupon.manage",
  },
  {
    label: "Blocked phones",
    href: "/admin/blocked-phones",
    icon: "phone-off",
    phase: 8,
    group: "operations",
    permission: "customer.block",
  },
  {
    label: "Till",
    href: "/admin/pos",
    icon: "store",
    phase: 9,
    group: "operations",
    permission: "pos.sell",
  },
  {
    label: "Returns & exchanges",
    href: "/admin/returns",
    icon: "rotate-ccw",
    phase: 9,
    group: "operations",
    permission: "return.manage",
  },
  {
    label: "Refunds to approve",
    href: "/admin/refunds",
    icon: "banknote",
    phase: 9,
    group: "operations",
    permission: "refund.approve",
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
    permission: "order.read",
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
    permission: "location.manage",
  },
  {
    label: "Delivery zones",
    href: "/admin/shipping",
    icon: "truck",
    phase: 8,
    group: "system",
    permission: "shipping.manage",
  },
  {
    label: "Checkout settings",
    href: "/admin/checkout-settings",
    icon: "sliders-horizontal",
    phase: 8,
    group: "system",
    permission: "checkout.settings",
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
