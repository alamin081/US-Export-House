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
  /** Import products from CSV / Excel and bulk-upload their images. */
  "catalog.import",
  /** Download the catalogue as CSV (purchase cost only with inventory.cost.read). */
  "catalog.export",
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
  /** Reports and dashboard figures, limited to the staff member's locations. */
  "report.view",
  /** Download reports as CSV. */
  "report.export",
  /** Edit home page, menus, footer and pages (drafts). */
  "content.write",
  /** Put content live: publish, unpublish and restore versions. */
  "content.publish",
  "settings.write",
  "staff.manage",
  /** Edit roles and their permissions. Super Admin only. */
  "role.manage",
  "audit.view",
  /** Download the audit log as CSV. */
  "audit.export",
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
      "catalog.import",
      "catalog.export",
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
  { label: "Insight", keys: ["report.view", "report.export", "audit.view", "audit.export"] },
  { label: "Content", keys: ["content.write", "content.publish"] },
  { label: "Administration", keys: ["settings.write", "staff.manage", "role.manage"] },
];

export const SUPER_ADMIN_ROLE = "Super Admin";

/** What each permission allows, for the role editor (English and Bengali). */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, { en: string; bn: string }> = {
  "catalog.read": {
    en: "See products, categories and options in the admin",
    bn: "অ্যাডমিনে প্রোডাক্ট দেখা",
  },
  "catalog.write": {
    en: "Edit products (not prices), variants, images, categories, brands",
    bn: "প্রোডাক্ট, ভ্যারিয়েন্ট, ছবি ও ক্যাটাগরি এডিট (দাম ছাড়া)",
  },
  "catalog.content": {
    en: "Edit product copy, SEO and alt text; create drafts",
    bn: "প্রোডাক্টের লেখা, SEO ও ছবির বিবরণ এডিট",
  },
  "catalog.price.write": { en: "Change prices and compare-at prices", bn: "দাম বদলানো" },
  "catalog.publish": { en: "Publish and archive products", bn: "প্রোডাক্ট প্রকাশ ও আর্কাইভ" },
  "catalog.delete": {
    en: "Delete draft products, categories, brands, size charts",
    bn: "খসড়া প্রোডাক্ট ও ক্যাটাগরি মোছা",
  },
  "catalog.import": {
    en: "Import products from CSV/Excel and bulk-upload images",
    bn: "CSV/Excel থেকে প্রোডাক্ট আমদানি ও বাল্ক ছবি",
  },
  "catalog.export": { en: "Download the catalogue as CSV", bn: "প্রোডাক্টের তালিকা CSV-তে নামানো" },
  "location.manage": {
    en: "Create and edit branches and warehouses",
    bn: "শাখা ও গুদাম তৈরি ও এডিট",
  },
  "inventory.read": { en: "See stock at their locations", bn: "নিজের লোকেশনের স্টক দেখা" },
  "inventory.adjust": { en: "Adjust stock with a reason", bn: "কারণসহ স্টক অ্যাডজাস্ট" },
  "inventory.receive": {
    en: "Receive stock and import stock CSV",
    bn: "স্টক রিসিভ ও স্টক CSV আমদানি",
  },
  "inventory.count": { en: "Run stock counts", bn: "স্টক গণনা" },
  "inventory.count.apply": { en: "Apply a count's corrections", bn: "গণনার সংশোধন প্রয়োগ" },
  "inventory.cost.read": {
    en: "See purchase cost, stock value and profit",
    bn: "ক্রয়মূল্য, স্টকের মূল্য ও লাভ দেখা",
  },
  "transfer.create": { en: "Create stock transfers", bn: "ট্রান্সফার তৈরি" },
  "transfer.approve": { en: "Approve transfers", bn: "ট্রান্সফার অনুমোদন" },
  "transfer.dispatch": { en: "Dispatch transfers", bn: "ট্রান্সফার পাঠানো" },
  "transfer.receive": { en: "Receive transfers", bn: "ট্রান্সফার গ্রহণ" },
  "order.read": { en: "See orders", bn: "অর্ডার দেখা" },
  "coupon.manage": { en: "Create and edit coupons", bn: "কুপন তৈরি ও এডিট" },
  "shipping.manage": { en: "Delivery zones, charges and areas", bn: "ডেলিভারি জোন ও চার্জ" },
  "checkout.settings": {
    en: "Checkout limits, shop details and VAT settings",
    bn: "চেকআউটের সীমা, দোকানের তথ্য ও ভ্যাট",
  },
  "customer.block": { en: "Block and unblock phone numbers", bn: "ফোন নম্বর ব্লক ও আনব্লক" },
  "order.confirm": {
    en: "Call customers and confirm new orders",
    bn: "কল করে নতুন অর্ডার কনফার্ম",
  },
  "order.edit": { en: "Edit orders before packing", bn: "প্যাকিংয়ের আগে অর্ডার এডিট" },
  "order.cancel": { en: "Cancel orders", bn: "অর্ডার বাতিল" },
  "order.fulfil": { en: "Pack, ship and mark delivered", bn: "প্যাক, পাঠানো ও ডেলিভারড করা" },
  "order.cod.reconcile": {
    en: "Record cash received from couriers",
    bn: "কুরিয়ার থেকে টাকা পাওয়া রেকর্ড",
  },
  "refund.record": { en: "Record refunds", bn: "রিফান্ড রেকর্ড" },
  "refund.approve": { en: "Approve large refunds", bn: "বড় রিফান্ড অনুমোদন" },
  "invoice.print": {
    en: "Print invoices, packing slips and address labels",
    bn: "ইনভয়েস, প্যাকিং স্লিপ ও লেবেল প্রিন্ট",
  },
  "pos.sell": { en: "Sell at the till", bn: "দোকানে বিক্রি" },
  "pos.discount.override": {
    en: "Approve till discounts above the limit",
    bn: "সীমার বেশি ছাড় অনুমোদন",
  },
  "pos.day.manage": { en: "Open and close the till day", bn: "ক্যাশের দিন খোলা ও বন্ধ" },
  "label.print": { en: "Print barcode labels and generate barcodes", bn: "বারকোড লেবেল প্রিন্ট" },
  "return.manage": { en: "Handle returns and exchanges", bn: "রিটার্ন ও এক্সচেঞ্জ" },
  "return.policy.publish": {
    en: "Approve and publish the return policy",
    bn: "রিটার্ন নীতি অনুমোদন ও প্রকাশ",
  },
  "shipment.book": { en: "Book couriers (courier API, Phase 11)", bn: "কুরিয়ার বুকিং" },
  "customer.read": {
    en: "See customer phone numbers and details",
    bn: "কাস্টমারের ফোন ও তথ্য দেখা",
  },
  "report.view": {
    en: "See reports and dashboard figures for their locations",
    bn: "নিজের লোকেশনের রিপোর্ট দেখা",
  },
  "report.export": { en: "Download reports as CSV", bn: "রিপোর্ট CSV-তে নামানো" },
  "content.write": {
    en: "Edit home page, menu, footer and pages (drafts)",
    bn: "হোমপেজ, মেনু, ফুটার ও পেজ এডিট",
  },
  "content.publish": { en: "Publish content to the site", bn: "কনটেন্ট সাইটে প্রকাশ" },
  "settings.write": { en: "Change settings", bn: "সেটিংস বদলানো" },
  "staff.manage": {
    en: "Create staff accounts and give roles",
    bn: "স্টাফ অ্যাকাউন্ট ও রোল দেওয়া",
  },
  "role.manage": {
    en: "Edit roles and permissions (Super Admin only)",
    bn: "রোল ও অনুমতি এডিট (শুধু সুপার অ্যাডমিন)",
  },
  "audit.view": { en: "See the audit log", bn: "অডিট লগ দেখা" },
  "audit.export": { en: "Download the audit log as CSV", bn: "অডিট লগ CSV-তে নামানো" },
};

/** Permissions that open money, people or security; flagged in the role editor. */
export const SENSITIVE_PERMISSIONS: readonly PermissionKey[] = [
  "inventory.cost.read",
  "refund.approve",
  "staff.manage",
  "role.manage",
  "settings.write",
  "audit.export",
  "customer.read",
];

/** Only the Super Admin role may hold these. */
export const SUPER_ADMIN_ONLY: readonly PermissionKey[] = ["role.manage"];

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
    description: "Everything operational across all locations, except staff, roles and settings.",
    permissions: PERMISSIONS.filter(
      (key) => key !== "staff.manage" && key !== "settings.write" && key !== "role.manage",
    ),
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
      "report.export",
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
