/**
 * The order state machine — pure. Every status change in the app is checked
 * here first; the service then re-checks the status on the locked order row,
 * so two people acting on the same order at once cannot both succeed.
 *
 *   PENDING ──confirm──▶ CONFIRMED ──start packing──▶ PROCESSING ──ship──▶ SHIPPED ──▶ DELIVERED
 *      │                    │  ▲                         │                   │
 *      │                    │  └──────── unpack ─────────┘                   ▼
 *      └──────── cancel ────┴────────── cancel ──────────┘            DELIVERY_FAILED
 *                                                                      │        │
 *                                                       ship again ◀───┘        ▼
 *                                                                   RETURNED_TO_WAREHOUSE
 *
 * In-store sales are created DELIVERED and never move. RETURNED is a legacy
 * value that nothing uses.
 */
import type { PermissionKey } from "@/modules/access/permissions";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "DELIVERY_FAILED"
  | "RETURNED_TO_WAREHOUSE";

export type OrderTransition =
  | "CONFIRM"
  | "START_PACKING"
  | "UNPACK"
  | "CANCEL"
  | "SHIP"
  | "DELIVER"
  | "DELIVERY_FAILED"
  | "RETURN_TO_WAREHOUSE";

export interface TransitionRule {
  from: readonly OrderStatus[];
  to: OrderStatus;
  permission: PermissionKey;
}

export const TRANSITIONS: Record<OrderTransition, TransitionRule> = {
  CONFIRM: { from: ["PENDING"], to: "CONFIRMED", permission: "order.confirm" },
  START_PACKING: { from: ["CONFIRMED"], to: "PROCESSING", permission: "order.fulfil" },
  UNPACK: { from: ["PROCESSING"], to: "CONFIRMED", permission: "order.fulfil" },
  CANCEL: {
    from: ["PENDING", "CONFIRMED", "PROCESSING"],
    to: "CANCELLED",
    permission: "order.cancel",
  },
  // DELIVERY_FAILED -> SHIPPED is a second delivery attempt.
  SHIP: { from: ["PROCESSING", "DELIVERY_FAILED"], to: "SHIPPED", permission: "order.fulfil" },
  DELIVER: { from: ["SHIPPED"], to: "DELIVERED", permission: "order.fulfil" },
  DELIVERY_FAILED: { from: ["SHIPPED"], to: "DELIVERY_FAILED", permission: "order.fulfil" },
  RETURN_TO_WAREHOUSE: {
    from: ["DELIVERY_FAILED"],
    to: "RETURNED_TO_WAREHOUSE",
    permission: "order.fulfil",
  },
};

export function canTransition(status: OrderStatus, transition: OrderTransition): boolean {
  return TRANSITIONS[transition].from.includes(status);
}

/** Every transition allowed from a status, in a stable order (for buttons). */
export function transitionsFrom(status: OrderStatus): OrderTransition[] {
  return (Object.keys(TRANSITIONS) as OrderTransition[]).filter((key) =>
    canTransition(status, key),
  );
}

/** Items, quantities, address and location may change only before packing. */
export function isEditable(status: OrderStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

/** Stock is still reserved (not yet taken off the shelf). */
export function holdsReservation(status: OrderStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "PROCESSING";
}

/** Address corrections (a new invoice version once one exists). */
export function isAddressCorrectable(status: OrderStatus): boolean {
  return (
    isEditable(status) ||
    status === "PROCESSING" ||
    status === "SHIPPED" ||
    status === "DELIVERY_FAILED"
  );
}

// ---------------------------------------------------------------------------
// admin list tabs
// ---------------------------------------------------------------------------

export const ORDER_TABS = [
  { key: "new", label: "New", statuses: ["PENDING"] },
  { key: "confirmed", label: "Confirmed", statuses: ["CONFIRMED"] },
  { key: "packing", label: "Packing", statuses: ["PROCESSING"] },
  { key: "shipped", label: "Shipped", statuses: ["SHIPPED"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "failed", label: "Failed", statuses: ["DELIVERY_FAILED", "RETURNED_TO_WAREHOUSE"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "all", label: "All", statuses: [] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[];
}>;

export type OrderTabKey = (typeof ORDER_TABS)[number]["key"];

export function tabStatuses(key: string): readonly OrderStatus[] {
  return ORDER_TABS.find((tab) => tab.key === key)?.statuses ?? [];
}
