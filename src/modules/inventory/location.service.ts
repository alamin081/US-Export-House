import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  hasAnyPermission,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { runInventoryTransaction } from "./inventory.repository";
import { locationSaveSchema } from "./inventory.schema";
import { parse } from "./inventory.service";
import {
  deleteLocationWithoutHistory,
  findLocationById,
  findLocationHistory,
  findLocationStaff,
  isLocationCodeTaken,
  listLocationsWithTotals,
  lockLocation,
  saveLocation,
  type LocationRow,
} from "./location.repository";

/**
 * Branches and warehouses.
 *
 *   - Codes are unique capitals (WH-01); the database enforces the format.
 *   - Exactly one location is the default for online orders. It must be
 *     online and active, and stops being the default only when another
 *     location takes over.
 *   - A location with stock or history is never deleted, only deactivated;
 *     deactivating one that still holds stock needs a confirmation.
 */

/** Bangladesh's eight divisions, for the address picker. */
export const BD_DIVISIONS = [
  "Barishal",
  "Chattogram",
  "Dhaka",
  "Khulna",
  "Mymensingh",
  "Rajshahi",
  "Rangpur",
  "Sylhet",
] as const;

function invalid(message: string, field?: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError("VALIDATION_FAILED", message, {
    details: { ...(field === undefined ? {} : { field }), ...extra },
  });
}

export async function listLocationsForStaff(actor: StaffContext) {
  if (!hasAnyPermission(actor, ["location.manage", "inventory.read"])) {
    assertPermission(actor, "location.manage");
  }
  // Managers see every location (to manage them); others only their own.
  const scope = hasPermission(actor, "location.manage") ? undefined : locationScope(actor);
  return listLocationsWithTotals(scope);
}

export async function getLocationForStaff(actor: StaffContext, id: string) {
  if (!hasAnyPermission(actor, ["location.manage", "inventory.read"])) {
    assertPermission(actor, "location.manage");
  }
  if (!hasPermission(actor, "location.manage")) assertLocationAccess(actor, id);
  const location = await findLocationById(id);
  if (location === null) throw new AppError("NOT_FOUND", "Location not found.");
  const [staff, history] = await Promise.all([findLocationStaff(id), findLocationHistory(id)]);
  return { location, staff, history, canDelete: isWithoutHistory(history) };
}

function isWithoutHistory(history: Awaited<ReturnType<typeof findLocationHistory>>): boolean {
  return (
    history.onHand === 0 &&
    history.reserved === 0 &&
    history.movements === 0 &&
    history.transfers === 0 &&
    history.counts === 0 &&
    history.receipts === 0 &&
    history.orders === 0 &&
    history.shipments === 0
  );
}

function auditView(location: LocationRow) {
  const { createdAt: _created, updatedAt: _updated, deletedAt: _deleted, ...rest } = location;
  return rest;
}

export async function saveLocationForStaff(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "location.manage");
  const data = parse(locationSaveSchema, input);
  const existing = data.id === undefined ? null : await findLocationById(data.id);
  if (data.id !== undefined && existing === null)
    throw new AppError("NOT_FOUND", "Location not found.");

  if (await isLocationCodeTaken(data.code, data.id)) {
    throw invalid(`The code ${data.code} is already used by another location.`, "code");
  }
  if (data.isDefaultOnlineFulfillment && (!data.isOnlineFulfillment || !data.isActive)) {
    throw invalid(
      "The default online location must be active and fulfil online orders.",
      "isDefaultOnlineFulfillment",
    );
  }
  if (existing?.isDefaultOnlineFulfillment === true) {
    if (!data.isDefaultOnlineFulfillment) {
      throw invalid(
        "This is the default online location. Make another location the default first.",
        "isDefaultOnlineFulfillment",
      );
    }
    if (!data.isActive || !data.isOnlineFulfillment) {
      throw invalid("The default online location must stay active and online.", "isActive");
    }
  }
  if (existing !== null && existing.isActive && !data.isActive) {
    const history = await findLocationHistory(existing.id);
    if ((history.onHand > 0 || history.reserved > 0) && !data.confirmDeactivate) {
      throw invalid(
        `${existing.code} still holds ${history.onHand} units (${history.reserved} reserved). Move or count the stock first, or confirm to deactivate anyway.`,
        "confirmDeactivate",
        { needsConfirmation: true, onHand: history.onHand },
      );
    }
  }

  const { id, confirmDeactivate: _confirm, isDefaultOnlineFulfillment, ...fields } = data;
  return runInventoryTransaction(async (uow) => {
    if (id !== undefined) await lockLocation(uow, id);
    const saved = await saveLocation(uow, {
      ...(id === undefined ? {} : { id }),
      data: fields,
      makeDefault: isDefaultOnlineFulfillment && existing?.isDefaultOnlineFulfillment !== true,
    });
    const action =
      existing === null
        ? AUDIT_ACTIONS.locationCreated
        : existing.isActive && !saved.isActive
          ? AUDIT_ACTIONS.locationDeactivated
          : !existing.isActive && saved.isActive
            ? AUDIT_ACTIONS.locationReactivated
            : AUDIT_ACTIONS.locationUpdated;
    await uow.audit({
      userId: actor.userId,
      action,
      entityType: "location",
      entityId: saved.id,
      locationId: saved.id,
      before: existing === null ? null : auditView(existing),
      after: auditView(saved),
      ...meta,
    });
    if (saved.isDefaultOnlineFulfillment && existing?.isDefaultOnlineFulfillment !== true) {
      await uow.audit({
        userId: actor.userId,
        action: AUDIT_ACTIONS.locationDefaultChanged,
        entityType: "location",
        entityId: saved.id,
        locationId: saved.id,
        after: { code: saved.code },
        ...meta,
      });
    }
    return saved;
  });
}

/** Removes a location that has never held stock or any history. */
export async function deleteLocationForStaff(actor: StaffContext, id: string, meta: RequestMeta) {
  assertPermission(actor, "location.manage");
  const location = await findLocationById(id);
  if (location === null) throw new AppError("NOT_FOUND", "Location not found.");
  if (location.isDefaultOnlineFulfillment) {
    throw new AppError("CONFLICT", "The default online location cannot be deleted.");
  }
  const history = await findLocationHistory(id);
  if (!isWithoutHistory(history)) {
    throw new AppError(
      "CONFLICT",
      `${location.code} has stock or history (movements, transfers, counts or orders). Deactivate it instead.`,
    );
  }
  await runInventoryTransaction(async (uow) => {
    await lockLocation(uow, id);
    await deleteLocationWithoutHistory(uow, id);
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.locationDeleted,
      entityType: "location",
      entityId: id,
      before: auditView(location),
      ...meta,
    });
  });
}
