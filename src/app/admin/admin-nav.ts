/**
 * Admin navigation.
 *
 * The dashboard is English-only for now (master spec section 3.6). It is built
 * with the same primitives as the storefront, so adding `next-intl` later is a
 * matter of swapping these labels for message keys.
 *
 * `phase` records which phase delivers the real screen, and the sidebar shows
 * it so nobody mistakes a visual shell for working functionality.
 */
export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  phase: number;
  group: "overview" | "catalogue" | "operations" | "insight" | "system";
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "gauge", phase: 12, group: "overview" },

  { label: "Products", href: "/admin/products", icon: "shirt", phase: 6, group: "catalogue" },
  { label: "Categories", href: "/admin/categories", icon: "tags", phase: 6, group: "catalogue" },
  { label: "Inventory", href: "/admin/inventory", icon: "boxes", phase: 7, group: "catalogue" },
  {
    label: "Transfers",
    href: "/admin/transfers",
    icon: "arrow-left-right",
    phase: 7,
    group: "catalogue",
  },

  { label: "Orders", href: "/admin/orders", icon: "receipt", phase: 9, group: "operations" },
  { label: "In-store sale", href: "/admin/pos", icon: "store", phase: 9, group: "operations" },
  { label: "Returns", href: "/admin/returns", icon: "rotate-ccw", phase: 9, group: "operations" },
  { label: "Shipments", href: "/admin/shipments", icon: "truck", phase: 11, group: "operations" },
  { label: "Customers", href: "/admin/customers", icon: "users", phase: 9, group: "operations" },

  {
    label: "Reports",
    href: "/admin/reports",
    icon: "chart-no-axes-column",
    phase: 12,
    group: "insight",
  },
  { label: "Audit log", href: "/admin/audit", icon: "scroll-text", phase: 12, group: "insight" },

  { label: "Locations", href: "/admin/locations", icon: "map-pin", phase: 7, group: "system" },
  { label: "Staff & roles", href: "/admin/staff", icon: "shield", phase: 5, group: "system" },
  { label: "Content", href: "/admin/content", icon: "layout-template", phase: 12, group: "system" },
  { label: "Settings", href: "/admin/settings", icon: "settings", phase: 12, group: "system" },
];

export const ADMIN_GROUP_LABELS: Record<AdminNavItem["group"], string> = {
  overview: "Overview",
  catalogue: "Catalogue",
  operations: "Operations",
  insight: "Insight",
  system: "System",
};

/** Placeholder branch switcher data until `Location` exists (Phase 7). */
export const ADMIN_LOCATIONS = [
  "All locations",
  "Central Warehouse",
  "Gulshan Showroom",
  "Dhanmondi Showroom",
  "Chattogram Showroom",
] as const;
