import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { InventoryUnitOfWork } from "./inventory.repository";

/**
 * Branches and warehouses. Writes run inside an inventory transaction (so the
 * audit row commits with them); reads go straight to the database.
 */

const locationSelect = {
  id: true,
  code: true,
  type: true,
  nameEn: true,
  nameBn: true,
  addressEn: true,
  addressBn: true,
  division: true,
  district: true,
  thana: true,
  phone: true,
  hoursEn: true,
  hoursBn: true,
  mapUrl: true,
  isActive: true,
  isOnlineFulfillment: true,
  isDefaultOnlineFulfillment: true,
  isSample: true,
  sortOrder: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LocationSelect;

export type LocationRow = Prisma.LocationGetPayload<{ select: typeof locationSelect }>;

/** Active, non-deleted locations; `undefined` scope means all of them. */
export async function findActiveLocations(scope: readonly string[] | undefined) {
  return db.location.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(scope === undefined ? {} : { id: { in: [...scope] } }),
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: locationSelect,
  });
}

/** Every non-deleted location (active or not) in scope, with stock totals. */
export async function listLocationsWithTotals(scope: readonly string[] | undefined) {
  const locations = await db.location.findMany({
    where: { deletedAt: null, ...(scope === undefined ? {} : { id: { in: [...scope] } }) },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { ...locationSelect, _count: { select: { staffAccess: true } } },
  });
  const totals = await db.inventoryLevel.groupBy({
    by: ["locationId"],
    where: { locationId: { in: locations.map((location) => location.id) } },
    _sum: { onHand: true, reserved: true },
  });
  const byId = new Map(totals.map((row) => [row.locationId, row._sum]));
  return locations.map((location) => ({
    ...location,
    onHand: byId.get(location.id)?.onHand ?? 0,
    reserved: byId.get(location.id)?.reserved ?? 0,
  }));
}

export async function findLocationById(id: string) {
  return db.location.findFirst({ where: { id, deletedAt: null }, select: locationSelect });
}

export async function isLocationCodeTaken(code: string, exceptId?: string) {
  const row = await db.location.findFirst({
    where: { code, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  return row !== null;
}

/** Staff explicitly assigned to the location, plus the roles that see every location. */
export async function findLocationStaff(locationId: string) {
  const [assigned, allLocationRoles] = await Promise.all([
    db.staffLocationAccess.findMany({
      where: { locationId, user: { deletedAt: null } },
      orderBy: { user: { name: "asc" } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            role: { select: { name: true, allLocations: true } },
          },
        },
      },
    }),
    db.role.findMany({
      where: { allLocations: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true, _count: { select: { users: true } } },
    }),
  ]);
  return { assigned: assigned.map((row) => row.user), allLocationRoles };
}

/** Everything that ties a location to history; any of it blocks deletion. */
export async function findLocationHistory(locationId: string) {
  const [stock, movements, transfers, counts, receipts, orders, shipments] = await Promise.all([
    db.inventoryLevel.aggregate({
      where: { locationId },
      _sum: { onHand: true, reserved: true },
    }),
    db.inventoryMovement.count({ where: { locationId } }),
    db.stockTransfer.count({
      where: { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] },
    }),
    db.stockCount.count({ where: { locationId } }),
    db.stockReceipt.count({ where: { locationId } }),
    db.order.count({ where: { locationId } }),
    db.shipment.count({ where: { fromLocationId: locationId } }),
  ]);
  return {
    onHand: stock._sum.onHand ?? 0,
    reserved: stock._sum.reserved ?? 0,
    movements,
    transfers,
    counts,
    receipts,
    orders,
    shipments,
  };
}

export type LocationWriteData = Omit<
  Prisma.LocationUncheckedCreateInput,
  "id" | "createdAt" | "updatedAt" | "deletedAt" | "isDefaultOnlineFulfillment"
>;

/**
 * Creates or updates a location. When it becomes the default online location,
 * the previous default is cleared first in the same transaction (a partial
 * unique index allows only one default).
 */
export async function saveLocation(
  uow: InventoryUnitOfWork,
  input: { id?: string; data: LocationWriteData; makeDefault: boolean },
) {
  const { tx } = uow;
  if (input.makeDefault) {
    await tx.location.updateMany({
      where: {
        isDefaultOnlineFulfillment: true,
        ...(input.id === undefined ? {} : { id: { not: input.id } }),
      },
      data: { isDefaultOnlineFulfillment: false },
    });
  }
  if (input.id === undefined) {
    return tx.location.create({
      data: { ...input.data, isDefaultOnlineFulfillment: input.makeDefault },
      select: locationSelect,
    });
  }
  return tx.location.update({
    where: { id: input.id },
    data: { ...input.data, ...(input.makeDefault ? { isDefaultOnlineFulfillment: true } : {}) },
    select: locationSelect,
  });
}

export async function lockLocation(uow: InventoryUnitOfWork, id: string) {
  const rows = await uow.tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Location" WHERE "id" = ${id} AND "deletedAt" IS NULL FOR UPDATE
  `;
  return rows.length > 0;
}

/** Hard delete of a location without history (its empty stock rows go too). */
export async function deleteLocationWithoutHistory(uow: InventoryUnitOfWork, id: string) {
  await uow.tx.inventoryLevel.deleteMany({ where: { locationId: id, onHand: 0, reserved: 0 } });
  await uow.tx.location.delete({ where: { id } });
}
