import "server-only";

import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import type { InventoryUnitOfWork } from "@/modules/inventory/inventory.repository";
import type { OrderTx } from "@/modules/orders/orders.repository";
import { getStoreSettings } from "@/modules/settings/settings.service";
import {
  buildInvoiceSnapshot,
  formatInvoiceNumber,
  type InvoiceSnapshot,
} from "./invoice-snapshot";
import { findInvoice } from "./invoice.repository";

/**
 * Issues an invoice version inside the caller's transaction (the one that
 * ships the order or rings up the sale). The first version takes the next
 * INV number; a correction keeps the number and adds a version, and the
 * earlier version stays on record.
 */
export async function issueInvoiceInTx(input: {
  uow: InventoryUnitOfWork;
  tx: OrderTx;
  orderId: string;
  current: { number: string; version: number } | null;
  reason: string | null;
  userId: string | null;
  meta: RequestMeta;
  now?: Date;
}): Promise<{ number: string; version: number }> {
  const issuedAt = input.now ?? new Date();
  const number =
    input.current?.number ?? formatInvoiceNumber(issuedAt, await input.tx.nextSequence("invoice"));
  const version = (input.current?.version ?? 0) + 1;
  const [source, store] = await Promise.all([
    input.tx.invoiceSource(input.orderId),
    getStoreSettings(),
  ]);
  const snapshot: InvoiceSnapshot = buildInvoiceSnapshot({
    number,
    version,
    issuedAt,
    store,
    source: {
      ...source,
      paymentMethod: source.paymentMethod,
      payments: source.payments,
      locationName: source.location.nameEn,
      soldByName: source.soldBy?.name ?? null,
    },
  });
  await input.tx.createInvoice({
    number,
    orderId: input.orderId,
    version,
    snapshot,
    reason: input.reason,
    issuedByUserId: input.userId,
    issuedAt,
  });
  await input.uow.audit({
    userId: input.userId,
    action: AUDIT_ACTIONS.invoiceIssued,
    entityType: "order",
    entityId: input.orderId,
    after: { number, version, reason: input.reason },
    ip: input.meta.ip,
    userAgent: input.meta.userAgent,
  });
  return { number, version };
}

/** An issued invoice, exactly as it was issued, for printing. */
export async function getInvoiceForPrint(
  staff: StaffContext,
  orderId: string,
  rawVersion?: string,
) {
  assertPermission(staff, "invoice.print");
  const version =
    rawVersion === undefined || !/^\d{1,4}$/.test(rawVersion) ? null : Number(rawVersion);
  const invoice = await findInvoice(orderId, version);
  if (invoice === null)
    throw new AppError("NOT_FOUND", "No invoice yet: it is issued when the order ships.");
  assertLocationAccess(staff, invoice.order.locationId);
  return {
    snapshot: invoice.snapshot as unknown as InvoiceSnapshot,
    isCurrent: invoice.isCurrent,
    reason: invoice.reason,
  };
}
