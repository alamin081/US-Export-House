import "server-only";

import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import type { PermissionKey } from "@/modules/access/permissions";
import type { AuditAction, RequestMeta } from "@/modules/audit/audit.service";
import {
  runInventoryTransaction,
  type InventoryUnitOfWork,
} from "@/modules/inventory/inventory.repository";
import { canTransition, TRANSITIONS, type OrderStatus, type OrderTransition } from "./order-state";
import { OrderTx, type LockedOrder } from "./orders.repository";

/** Shared plumbing for the order services: errors, the locked-order transaction, audit. */

export function invalid(message: string, field?: string): AppError {
  return new AppError("VALIDATION_FAILED", message, {
    details: field === undefined ? {} : { field },
  });
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message);
}

export function orderNotFound(): AppError {
  return new AppError("NOT_FOUND", "Order not found.");
}

export interface OrderWork {
  uow: InventoryUnitOfWork;
  tx: OrderTx;
  order: LockedOrder;
}

/**
 * Runs `work` with the order row locked (FOR UPDATE), after checking the
 * staff member may act on the order's location and, when given, that the
 * form was opened on the current version. Everything inside commits or rolls
 * back together, stock included.
 */
export async function withLockedOrder<T>(
  staff: StaffContext,
  orderId: string,
  options: { version?: number | undefined },
  work: (context: OrderWork) => Promise<T>,
): Promise<T> {
  return runInventoryTransaction(async (uow) => {
    const tx = new OrderTx(uow);
    const order = await tx.lockOrder(orderId);
    if (order === null) throw orderNotFound();
    assertLocationAccess(staff, order.locationId);
    if (options.version !== undefined && options.version !== order.version) {
      throw conflict("This order was changed by someone else. Reload it and try again.");
    }
    return work({ uow, tx, order });
  });
}

/** Permission and current status for a state change, checked on the locked row. */
export function assertTransition(
  staff: StaffContext,
  order: { status: string; channel: string },
  transition: OrderTransition,
): OrderStatus {
  assertPermission(staff, TRANSITIONS[transition].permission);
  if (order.channel !== "ONLINE") throw conflict("In-store sales cannot change status.");
  if (!canTransition(order.status as OrderStatus, transition)) {
    throw conflict(`This order is ${order.status.toLowerCase()}; that step is not possible now.`);
  }
  return TRANSITIONS[transition].to;
}

export function assertAnyPermission(staff: StaffContext, keys: readonly PermissionKey[]) {
  if (!keys.some((key) => staff.permissions.includes(key))) assertPermission(staff, keys[0]!);
}

export async function auditInTx(
  uow: InventoryUnitOfWork,
  staff: StaffContext,
  meta: RequestMeta,
  entry: {
    action: AuditAction;
    orderId: string;
    locationId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await uow.audit({
    userId: staff.userId,
    action: entry.action,
    entityType: "order",
    entityId: entry.orderId,
    locationId: entry.locationId ?? null,
    before: entry.before,
    after: entry.after,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
