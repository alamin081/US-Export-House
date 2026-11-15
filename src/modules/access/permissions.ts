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
  /** Create and edit branches and warehouses. */
  "location.manage",
  /** Stock at the locations the staff member may access. */
  "inventory.read",
  /** Manual stock adjustments with a reason. */
  "inventory.adjust",
  /** Receive stock from suppliers and import stock from CSV. */
  "inventory.receive",
  /** Run physical stock counts. */
  "inventory.count",
  /** Apply a submitted count's corrections to stock. */
  "inventory.count.apply",
  /** Purchase cost and stock value. Never for branch sales staff. */
  "inventory.cost.read",
  "transfer.create",
  /** Approve a transfer before dispatch (when `transfer.requireApproval` is on). */
  "transfer.approve",
  "transfer.dispatch",
  "transfer.receive",
  "order.read",
  /** Online coupons. */
  "coupon.manage",
  /** Delivery zones, charges and the area-to-zone mapping. */
  "shipping.manage",
  /** Checkout limits and the store contact phone. */
  "checkout.settings",
  /** Block / unblock phone numbers from ordering. */
  "customer.block",
  /** Call log and confirming pending online orders. */
  "order.confirm",
  /** Items, quantities, variants, address and fulfilment location before packing. */
  "order.edit",
  "order.cancel",
  /** Packing, shipping and delivery status (couriers typed in by hand). */
  "order.fulfil",
  /** Recording money received from couriers for cash-on-delivery orders. */
  "order.cod.reconcile",
  /** Recording a refund (the money itself moves outside the app). */
  "refund.record",
  /** Approving refunds above `refund.approvalAbovePoisha`. */
  "refund.approve",
  /** Invoices, packing slips and address labels. */
  "invoice.print",
  "pos.sell",
  /** Approving a till discount above the seller's role limit. */
  "pos.discount.override",
  /** Opening and closing the till day (cash drawer, Z-report). */
  "pos.day.manage",
  /** Barcode labels and generating missing barcodes. */
  "label.print",
  "return.manage",
  /** Approving and publishing the return policy page. */
  "return.policy.publish",
  /** Courier API bookings (Phase 11). */
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
      "location.manage",
      "inventory.read",
      "inventory.adjust",
      "inventory.receive",
      "inventory.count",
      "inventory.count.apply",
      "inventory.cost.read",
      "transfer.create",
      "transfer.approve",
      "transfer.dispatch",
      "transfer.receive",
    ],
  },
  {
    label: "Orders & sales",
    keys: [
      "order.read",
      "order.confirm",
      "order.edit",
      "order.cancel",
      "order.fulfil",
      "order.cod.reconcile",
      "invoice.print",
      "shipment.book",
      "customer.read",
      "customer.block",
    ],
  },
  {
    label: "Returns & till",
    keys: [
      "return.manage",
      "return.policy.publish",
      "refund.record",
      "refund.approve",
      "pos.sell",
      "pos.discount.override",
      "pos.day.manage",
      "label.print",
    ],
  },
  { label: "Checkout", keys: ["coupon.manage", "shipping.manage", "checkout.settings"] },
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
      // Counts, but not applying them; no receiving (all goods arrive at the
      // warehouse first) and no purchase cost.
      "inventory.count",
      "order.read",
      "pos.sell",
      "pos.discount.override",
      "pos.day.manage",
      "return.manage",
      "refund.record",
      "label.print",
      "customer.read",
      "report.view",
    ],
    allLocations: false,
  },
  {
    name: "Branch Sales Staff",
    description: "In-store selling and stock lookup at their own branch.",
    permissions: [
      "catalog.read",
      "inventory.read",
      "pos.sell",
      "label.print",
      "order.read",
      "customer.read",
    ],
    allLocations: false,
  },
  {
    name: "Order Staff",
    description: "Processes online orders and books couriers.",
    permissions: [
      "catalog.read",
      "inventory.read",
      "order.read",
      "order.confirm",
      "order.edit",
      "order.cancel",
      "order.fulfil",
      "invoice.print",
      "shipment.book",
      "return.manage",
      "customer.read",
      "customer.block",
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
      "inventory.receive",
      // Counts, but a Store Manager applies them; no purchase cost.
      "inventory.count",
      "transfer.create",
      "transfer.dispatch",
      "transfer.receive",
      "label.print",
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
