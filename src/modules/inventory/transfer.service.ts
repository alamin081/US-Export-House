import { AppError } from "@/lib/errors";
import {
  assertPermission,
  canAccessLocation,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { getInventorySettings } from "@/modules/settings/settings.service";
import { findVariantsByIds } from "./inventory-query.repository";
import { runInventoryTransaction, type InventoryUnitOfWork } from "./inventory.repository";
import {
  transferCancelSchema,
  transferDraftSchema,
  transferListSchema,
  transferReceiveSchema,
} from "./inventory.schema";
import { applyStockMovements, nextDocumentReference, parse } from "./inventory.service";
import { findActiveLocations, findLocationById } from "./location.repository";
import { mergeLines } from "./lock-order";
import {
  createTransfer,
  findDiscrepancies,
  findTransfer,
  listTransfers,
  lockTransfer,
  replaceDraftLines,
  saveReceivedLines,
  updateTransferState,
} from "./transfer.repository";
import {
  canTransfer,
  lineDiscrepancy,
  resolveReceiveLine,
  transferBlockedMessage,
  type DiscrepancyReason,
  type TransferAction,
  type TransferStatus,
} from "./transfer-rules";

/**
 * Stock transfers between locations. The two-sided check is the control:
 * the SOURCE's staff dispatch (`transfer.dispatch`), the DESTINATION's staff
 * receive (`transfer.receive`). Stock in DISPATCHED transfers is "in transit"
 * and counts towards no location's available stock.
 */

function forbiddenLocation(code: string): AppError {
  return new AppError("LOCATION_FORBIDDEN", `You do not have access to ${code}.`, {
    messageKey: "errors.locationForbidden",
  });
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", "Transfer not found.", { messageKey: "errors.notFound" });
}

async function activeLocation(id: string) {
  const location = await findLocationById(id);
  if (location === null) throw new AppError("NOT_FOUND", "Location not found.");
  if (!location.isActive) throw new AppError("VALIDATION_FAILED", `${location.code} is inactive.`);
  return location;
}

/** The same check inside a transaction (no second pooled connection). */
async function activeLocationIn(uow: InventoryUnitOfWork, id: string) {
  const location = (await uow.locations([id])).get(id);
  if (location === undefined || location.deletedAt !== null) {
    throw new AppError("NOT_FOUND", "Location not found.");
  }
  if (!location.isActive) throw new AppError("VALIDATION_FAILED", `${location.code} is inactive.`);
  return location;
}

function assertState(status: string, action: TransferAction, requireApproval: boolean) {
  const current = status as TransferStatus;
  if (!canTransfer(current, action, { requireApproval })) {
    throw new AppError("CONFLICT", transferBlockedMessage(current, action, { requireApproval }));
  }
}

async function liveLines(lines: ReadonlyArray<{ variantId: string; quantity: number }>) {
  const merged = mergeLines(lines.map((line) => ({ ...line, locationId: "" })));
  const variants = await findVariantsByIds(merged.map((line) => line.variantId));
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const line of merged) {
    const variant = byId.get(line.variantId);
    if (variant === undefined || variant.deletedAt !== null || variant.product.deletedAt !== null) {
      throw new AppError("VALIDATION_FAILED", "An item on the transfer is archived or missing.");
    }
  }
  return merged.map(({ variantId, quantity }) => ({ variantId, quantity }));
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function listTransfersForStaff(
  actor: StaffContext,
  rawQuery: Record<string, unknown>,
) {
  if (!hasPermission(actor, "inventory.read")) assertPermission(actor, "transfer.create");
  const query = transferListSchema.parse(rawQuery);
  if (query.locationId !== undefined && !canAccessLocation(actor, query.locationId)) {
    throw forbiddenLocation("that location");
  }
  const take = 25;
  const { rows, total } = await listTransfers({
    scope: locationScope(actor),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
    skip: (query.page - 1) * take,
    take,
  });
  return {
    query,
    rows: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      from: row.fromLocation.code,
      to: row.toLocation.code,
      lines: row._count.items,
      units: row.items.reduce((sum, item) => sum + item.quantitySent, 0),
      discrepancy: row.items.some(
        (item) => item.quantityReceived !== null && item.quantityReceived !== item.quantitySent,
      ),
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / take)),
  };
}

/** One transfer, if the caller may see either end of it. */
export async function getTransfer(actor: StaffContext, id: string) {
  if (!hasPermission(actor, "inventory.read")) assertPermission(actor, "transfer.create");
  const transfer = await findTransfer(id);
  if (transfer === null) throw notFound();
  if (
    !canAccessLocation(actor, transfer.fromLocationId) &&
    !canAccessLocation(actor, transfer.toLocationId)
  ) {
    throw forbiddenLocation(`${transfer.fromLocation.code} or ${transfer.toLocation.code}`);
  }
  const settings = await getInventorySettings();
  const requireApproval = settings.transferRequireApproval;
  const status = transfer.status as TransferStatus;
  const atSource = canAccessLocation(actor, transfer.fromLocationId);
  const atDestination = canAccessLocation(actor, transfer.toLocationId);
  return {
    transfer: {
      ...transfer,
      items: transfer.items.map((item) => ({
        ...item,
        discrepancy:
          item.quantityReceived === null
            ? null
            : lineDiscrepancy(item.quantitySent, item.quantityReceived),
      })),
    },
    requireApproval,
    can: {
      edit:
        canTransfer(status, "edit", { requireApproval }) &&
        hasPermission(actor, "transfer.create") &&
        (atSource || atDestination),
      approve:
        canTransfer(status, "approve", { requireApproval }) &&
        hasPermission(actor, "transfer.approve"),
      dispatch:
        canTransfer(status, "dispatch", { requireApproval }) &&
        hasPermission(actor, "transfer.dispatch") &&
        atSource,
      receive:
        canTransfer(status, "receive", { requireApproval }) &&
        hasPermission(actor, "transfer.receive") &&
        atDestination,
      cancel:
        canTransfer(status, "cancel", { requireApproval }) &&
        (hasPermission(actor, "transfer.create") || hasPermission(actor, "transfer.approve")) &&
        (atSource || atDestination),
    },
  };
}

export async function listTransferDiscrepancies(actor: StaffContext, page = 1) {
  assertPermission(actor, "inventory.read");
  const take = 50;
  const { rows, total } = await findDiscrepancies({
    scope: locationScope(actor),
    skip: (Math.max(1, page) - 1) * take,
    take,
  });
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / take)) };
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

/** Creates a DRAFT, or replaces a draft's locations and lines. */
export async function saveTransferDraft(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "transfer.create");
  const data = parse(transferDraftSchema, input);
  const [from, to] = await Promise.all([
    activeLocation(data.fromLocationId),
    activeLocation(data.toLocationId),
  ]);
  if (!canAccessLocation(actor, from.id) && !canAccessLocation(actor, to.id)) {
    throw forbiddenLocation(`${from.code} or ${to.code}`);
  }
  const lines = await liveLines(data.lines);

  return runInventoryTransaction(async (uow) => {
    if (data.id === undefined) {
      const reference = await nextDocumentReference(uow, "transfer");
      const created = await createTransfer(uow, {
        reference,
        fromLocationId: from.id,
        toLocationId: to.id,
        note: data.note,
        createdByUserId: actor.userId,
        lines,
      });
      await uow.audit({
        userId: actor.userId,
        action: AUDIT_ACTIONS.transferCreated,
        entityType: "stock_transfer",
        entityId: created.id,
        locationId: from.id,
        after: { reference, status: "DRAFT", from: from.code, to: to.code, lines },
        ...meta,
      });
      return created;
    }
    const current = await lockTransfer(uow, data.id);
    if (current === null) throw notFound();
    assertState(current.status, "edit", false);
    if (
      !canAccessLocation(actor, current.fromLocationId) &&
      !canAccessLocation(actor, current.toLocationId)
    ) {
      throw forbiddenLocation("this transfer's locations");
    }
    await replaceDraftLines(uow, current.id, {
      fromLocationId: from.id,
      toLocationId: to.id,
      note: data.note,
      lines,
    });
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.transferUpdated,
      entityType: "stock_transfer",
      entityId: current.id,
      locationId: from.id,
      before: {
        lines: current.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantitySent,
        })),
      },
      after: { from: from.code, to: to.code, lines },
      ...meta,
    });
    return { id: current.id, reference: current.reference };
  });
}

async function transition(
  actor: StaffContext,
  transferId: string,
  action: TransferAction,
  meta: RequestMeta,
  work: (
    uow: InventoryUnitOfWork,
    transfer: NonNullable<Awaited<ReturnType<typeof lockTransfer>>>,
  ) => Promise<{
    data: Record<string, unknown>;
    audit: Record<string, unknown>;
    status: TransferStatus;
  }>,
) {
  const settings = await getInventorySettings();
  return runInventoryTransaction(
    async (uow) => {
      const transfer = await lockTransfer(uow, transferId);
      if (transfer === null) throw notFound();
      assertState(transfer.status, action, settings.transferRequireApproval);
      const result = await work(uow, transfer);
      await updateTransferState(uow, transfer.id, { ...result.data, status: result.status });
      await uow.audit({
        userId: actor.userId,
        action: {
          approve: AUDIT_ACTIONS.transferApproved,
          dispatch: AUDIT_ACTIONS.transferDispatched,
          receive: AUDIT_ACTIONS.transferReceived,
          cancel: AUDIT_ACTIONS.transferCancelled,
          edit: AUDIT_ACTIONS.transferUpdated,
        }[action],
        entityType: "stock_transfer",
        entityId: transfer.id,
        locationId: action === "receive" ? transfer.toLocationId : transfer.fromLocationId,
        before: { status: transfer.status },
        after: { reference: transfer.reference, status: result.status, ...result.audit },
        ...meta,
      });
      return { id: transfer.id, reference: transfer.reference, status: result.status };
    },
    { timeoutMs: 60_000 },
  );
}

/** Store Manager approval (only when `transfer.requireApproval` is on). */
export async function approveTransfer(actor: StaffContext, transferId: string, meta: RequestMeta) {
  assertPermission(actor, "transfer.approve");
  return transition(actor, transferId, "approve", meta, async () => ({
    status: "APPROVED",
    data: { approvedAt: new Date(), approvedByUserId: actor.userId },
    audit: {},
  }));
}

/** The source sends the goods: its stock goes down, the goods are in transit. */
export async function transferDispatch(actor: StaffContext, transferId: string, meta: RequestMeta) {
  assertPermission(actor, "transfer.dispatch");
  return transition(actor, transferId, "dispatch", meta, async (uow, transfer) => {
    if (!canAccessLocation(actor, transfer.fromLocationId)) {
      throw forbiddenLocation("the sending location");
    }
    const source = await activeLocationIn(uow, transfer.fromLocationId);
    await activeLocationIn(uow, transfer.toLocationId);
    if (transfer.items.length === 0)
      throw new AppError("VALIDATION_FAILED", "The transfer has no items.");
    await applyStockMovements(
      uow,
      transfer.items.map((item) => ({
        variantId: item.variantId,
        locationId: source.id,
        type: "TRANSFER_OUT" as const,
        quantity: -item.quantitySent,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        reason: transfer.reference,
        userId: actor.userId,
      })),
    );
    return {
      status: "DISPATCHED",
      data: { dispatchedAt: new Date(), dispatchedByUserId: actor.userId },
      audit: { units: transfer.items.reduce((sum, item) => sum + item.quantitySent, 0) },
    };
  });
}

/**
 * The destination records what actually arrived. Every line is booked in at
 * the quantity sent (TRANSFER_IN) and any difference is written off or added
 * as a TRANSFER_DISCREPANCY with its reason, so the ledger shows both.
 */
export async function transferReceive(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "transfer.receive");
  const data = parse(transferReceiveSchema, input);
  const result = await transition(
    actor,
    data.transferId,
    "receive",
    meta,
    async (uow, transfer) => {
      if (!canAccessLocation(actor, transfer.toLocationId)) {
        throw forbiddenLocation("the receiving location");
      }
      const destination = await activeLocationIn(uow, transfer.toLocationId);
      const received = new Map(data.lines.map((line) => [line.itemId, line]));
      const resolved: Array<{
        itemId: string;
        variantId: string;
        sent: number;
        received: number;
        reason: DiscrepancyReason | null;
      }> = [];
      for (const item of transfer.items) {
        const line = received.get(item.id);
        if (line === undefined) {
          throw new AppError("VALIDATION_FAILED", "Enter the received quantity for every line.");
        }
        const outcome = resolveReceiveLine(
          item.quantitySent,
          line.quantityReceived,
          line.reason ?? null,
        );
        if ("error" in outcome) {
          throw new AppError("VALIDATION_FAILED", outcome.error, {
            details: { field: `lines.${item.id}` },
          });
        }
        resolved.push({
          itemId: item.id,
          variantId: item.variantId,
          sent: item.quantitySent,
          received: line.quantityReceived,
          reason: outcome.reason,
        });
      }

      const base = {
        locationId: destination.id,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        userId: actor.userId,
      };
      await applyStockMovements(
        uow,
        resolved.flatMap((line) => {
          const difference = line.received - line.sent;
          return [
            {
              ...base,
              variantId: line.variantId,
              type: "TRANSFER_IN" as const,
              quantity: line.sent,
              reason: transfer.reference,
            },
            ...(difference === 0
              ? []
              : [
                  {
                    ...base,
                    variantId: line.variantId,
                    type: "TRANSFER_DISCREPANCY" as const,
                    quantity: difference,
                    reasonCode: line.reason,
                    reason: data.note ?? transfer.reference,
                  },
                ]),
          ];
        }),
      );
      await saveReceivedLines(
        uow,
        resolved.map((line) => ({
          itemId: line.itemId,
          quantityReceived: line.received,
          discrepancyReason: line.reason,
        })),
      );
      const discrepancies = resolved.filter((line) => line.reason !== null);
      return {
        status: "RECEIVED",
        data: {
          receivedAt: new Date(),
          receivedByUserId: actor.userId,
          ...(data.note === null
            ? {}
            : { note: [transfer.note, `Received: ${data.note}`].filter(Boolean).join("\n") }),
        },
        audit: {
          discrepancies: discrepancies.map((line) => ({
            variantId: line.variantId,
            sent: line.sent,
            received: line.received,
            reason: line.reason,
          })),
        },
      };
    },
  );
  return result;
}

export async function cancelTransfer(actor: StaffContext, input: unknown, meta: RequestMeta) {
  if (!hasPermission(actor, "transfer.approve")) assertPermission(actor, "transfer.create");
  const data = parse(transferCancelSchema, input);
  return transition(actor, data.transferId, "cancel", meta, async (_uow, transfer) => {
    if (
      !canAccessLocation(actor, transfer.fromLocationId) &&
      !canAccessLocation(actor, transfer.toLocationId)
    ) {
      throw forbiddenLocation("this transfer's locations");
    }
    return {
      status: "CANCELLED",
      data: { cancelledAt: new Date(), cancelledByUserId: actor.userId, cancelReason: data.reason },
      audit: { reason: data.reason },
    };
  });
}

/**
 * Locations for the transfer form: every active location (goods may go to a
 * branch the caller cannot see), flagged when the caller has access to it.
 */
export async function listTransferLocationOptions(actor: StaffContext) {
  assertPermission(actor, "transfer.create");
  const locations = await findActiveLocations(undefined);
  return locations.map((location) => ({
    id: location.id,
    code: location.code,
    nameEn: location.nameEn,
    isSample: location.isSample,
    mine: canAccessLocation(actor, location.id),
  }));
}
