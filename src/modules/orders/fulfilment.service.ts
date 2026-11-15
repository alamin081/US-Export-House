import "server-only";

import { z } from "zod";

import { parseTakaInput } from "@/lib/money";
import {
  assertLocationAccess,
  assertPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { isAppError } from "@/lib/errors";
import { issueInvoiceInTx } from "@/modules/invoices/invoice.service";
import { applyStockMovements, parse } from "@/modules/inventory/inventory.service";
import { notify } from "@/modules/notifications/notification.service";
import { COURIER_KEYS, COURIER_LABELS } from "@/modules/settings/order-settings";
import { getOrderSettings } from "@/modules/settings/settings.service";
import { assertTransition, auditInTx, conflict, invalid, withLockedOrder } from "./order-context";
import type { OrderStatus } from "./order-state";

/**
 * Packing, shipping and delivery for online orders. Couriers are typed in by
 * hand in this phase; each parcel is a `Shipment` row (mode MANUAL) that the
 * Phase 11 courier integration will create and update the same way.
 *
 * Stock: the reservation stays until the parcel leaves. SHIPPED takes the
 * goods off the shelf (RELEASE + SALE_ONLINE, as `commitSale` does) and
 * issues the invoice in the same transaction. A failed delivery touches no
 * stock until the parcel is back and inspected.
 */

const versionSchema = z.object({ version: z.coerce.number().int().min(0) });

export async function startPacking(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const { version } = parse(versionSchema, raw);
  return withLockedOrder(staff, orderId, { version }, async ({ uow, tx, order }) => {
    assertTransition(staff, order, "START_PACKING");
    await tx.updateOrder(order.id, { status: "PROCESSING", processedAt: new Date() });
    await tx.addHistory({ orderId: order.id, status: "PROCESSING", userId: staff.userId });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderPackingStarted,
      orderId: order.id,
      locationId: order.locationId,
      before: { status: order.status },
      after: { status: "PROCESSING" },
    });
    return { orderNumber: order.orderNumber };
  });
}

/** Back to CONFIRMED (to edit it, or move it to another location). */
export async function unpackOrder(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const { version } = parse(versionSchema, raw);
  return withLockedOrder(staff, orderId, { version }, async ({ uow, tx, order }) => {
    assertTransition(staff, order, "UNPACK");
    await tx.updateOrder(order.id, {
      status: "CONFIRMED",
      processedAt: null,
      packedAt: null,
      packedByUserId: null,
    });
    await tx.addHistory({
      orderId: order.id,
      status: "CONFIRMED",
      event: "UNPACKED",
      noteEn: "Packing undone.",
      userId: staff.userId,
    });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderUnpacked,
      orderId: order.id,
      locationId: order.locationId,
      before: { status: order.status, packedAt: order.packedAt },
      after: { status: "CONFIRMED" },
    });
    return { orderNumber: order.orderNumber };
  });
}

const packSchema = z.object({
  version: z.coerce.number().int().min(0),
  /** What the packing screen counted, per variant (scanned or ticked). */
  counted: z
    .array(
      z.object({
        variantId: z.string().min(1).max(40),
        quantity: z.coerce.number().int().min(0).max(1000),
      }),
    )
    .max(200),
});

/**
 * "Packing done": the counts from the packing screen must match the order
 * exactly — a wrong item or a missing piece is refused, never packed.
 */
export async function markPacked(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "order.fulfil");
  const input = parse(packSchema, raw);
  return withLockedOrder(staff, orderId, { version: input.version }, async ({ uow, tx, order }) => {
    if (order.status !== "PROCESSING") throw conflict("Start packing first.");
    const expected = new Map<string, number>();
    for (const item of order.items) {
      if (item.variantId === null) continue;
      expected.set(item.variantId, (expected.get(item.variantId) ?? 0) + item.quantity);
    }
    const counted = new Map<string, number>();
    for (const line of input.counted) {
      counted.set(line.variantId, (counted.get(line.variantId) ?? 0) + line.quantity);
    }
    const wrong = [...counted.entries()].filter(
      ([variantId, quantity]) => quantity > 0 && !expected.has(variantId),
    );
    const mismatched = [...expected.entries()].filter(
      ([variantId, quantity]) => (counted.get(variantId) ?? 0) !== quantity,
    );
    if (wrong.length > 0) throw conflict("An item that is not on this order was counted.");
    if (mismatched.length > 0) {
      const skus = order.items
        .filter((item) => mismatched.some(([variantId]) => variantId === item.variantId))
        .map((item) => item.sku);
      throw conflict(`Counts do not match the order: ${skus.join(", ")}.`);
    }
    const at = new Date();
    await tx.updateOrder(order.id, { packedAt: at, packedByUserId: staff.userId });
    await tx.addHistory({
      orderId: order.id,
      status: "PROCESSING",
      event: "PACKED",
      noteEn: "Packing complete; every item checked.",
      userId: staff.userId,
    });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderPacked,
      orderId: order.id,
      locationId: order.locationId,
      after: { packedAt: at.toISOString() },
    });
    return { orderNumber: order.orderNumber };
  });
}

// ---------------------------------------------------------------------------
// ship
// ---------------------------------------------------------------------------

const shipSchema = z
  .object({
    version: z.coerce.number().int().min(0).optional(),
    courier: z.enum(COURIER_KEYS, { error: "Choose a courier." }),
    courierName: z.string().trim().max(60).optional().default(""),
    trackingCode: z.string().trim().max(60).optional().default(""),
    /** Typed in taka; blank means "what is still owed". */
    codAmount: z.string().trim().max(20).optional().default(""),
    note: z.string().trim().max(300).optional().default(""),
  })
  .refine((value) => value.courier !== "OTHER" || value.courierName.length >= 2, {
    message: "Write the courier's name.",
    path: ["courierName"],
  })
  .refine((value) => value.courier === "MANUAL" || value.trackingCode.length >= 3, {
    message: "Enter the tracking or consignment number.",
    path: ["trackingCode"],
  });

export interface ShipResult {
  orderNumber: string;
  invoiceNumber: string | null;
  codAmountPoisha: number;
}

/**
 * Hands the parcel to a courier. From PROCESSING (packed) the goods leave the
 * shelf and the invoice is issued, all in one transaction; from
 * DELIVERY_FAILED it is a second attempt (stock was already taken).
 */
export async function shipOrder(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
): Promise<ShipResult> {
  const input = parse(shipSchema, raw);
  const settings = await getOrderSettings();
  if (!settings.couriers.includes(input.courier))
    throw invalid("That courier is not offered.", "courier");
  let codInput: number | null = null;
  if (input.codAmount !== "") {
    codInput = parseTakaInput(input.codAmount);
    if (codInput === null || codInput < 0)
      throw invalid("Enter the amount to collect in taka.", "codAmount");
  }
  const result = await withLockedOrder(
    staff,
    orderId,
    { version: input.version },
    async ({ uow, tx, order }) => {
      assertTransition(staff, order, "SHIP");
      const owed = Math.max(0, order.totalPoisha - order.paidPoisha);
      const codAmount = order.paymentMethod === "COD" ? (codInput ?? owed) : 0;
      if (codAmount > owed)
        throw invalid("The amount to collect is more than the order total.", "codAmount");
      const at = new Date();
      const firstShipment = order.status === "PROCESSING";
      if (firstShipment && order.packedAt === null) throw conflict("Finish packing first.");

      let invoiceNumber: string | null = order.invoices[0]?.number ?? null;
      if (firstShipment) {
        const lines = order.items.filter((item) => item.variantId !== null);
        const base = {
          locationId: order.locationId,
          referenceType: "ORDER",
          referenceId: order.id,
          userId: staff.userId,
          reason: `Order ${order.orderNumber} shipped`,
        };
        await applyStockMovements(
          uow,
          lines.flatMap((item) => [
            {
              ...base,
              variantId: item.variantId!,
              type: "RELEASE" as const,
              quantity: -item.quantity,
            },
            {
              ...base,
              variantId: item.variantId!,
              type: "SALE_ONLINE" as const,
              quantity: -item.quantity,
            },
          ]),
        );
      }

      const courierName = input.courier === "OTHER" ? input.courierName : null;
      const previous = order.shipments[0];
      const shipmentId =
        !firstShipment && previous !== undefined
          ? previous.id
          : (
              await tx.createShipment({
                orderId: order.id,
                courier: input.courier,
                courierName,
                mode: "MANUAL",
                status: "IN_TRANSIT",
                trackingCode: input.trackingCode === "" ? null : input.trackingCode,
                codAmountPoisha: codAmount,
                fromLocationId: order.locationId,
                bookedAt: at,
                note: input.note === "" ? null : input.note,
                createdByUserId: staff.userId,
              })
            ).id;
      if (!firstShipment && previous !== undefined) {
        await tx.updateShipment(previous.id, {
          courier: input.courier,
          courierName,
          status: "IN_TRANSIT",
          trackingCode: input.trackingCode === "" ? null : input.trackingCode,
          codAmountPoisha: codAmount,
          failedReason: null,
          note: input.note === "" ? previous.note : input.note,
        });
      }
      await tx.addShipmentEvent({
        shipmentId,
        status: "IN_TRANSIT",
        note: firstShipment ? "Handed to the courier." : "Sent out again.",
      });
      await tx.updateOrder(order.id, {
        status: "SHIPPED",
        shippedAt: at,
        ...(firstShipment ? {} : { deliveryFailedAt: null, deliveryFailedReason: null }),
      });
      await tx.setCodPaymentAmount(order.id, codAmount);
      if (firstShipment && invoiceNumber === null) {
        invoiceNumber = (
          await issueInvoiceInTx({
            uow,
            tx,
            orderId: order.id,
            current: null,
            reason: null,
            userId: staff.userId,
            meta,
            now: at,
          })
        ).number;
      }
      const courierText = courierName ?? COURIER_LABELS[input.courier];
      await tx.addHistory({
        orderId: order.id,
        status: "SHIPPED",
        noteEn: `${courierText}${input.trackingCode === "" ? "" : ` ${input.trackingCode}`}${firstShipment ? "" : " (second attempt)"}`,
        userId: staff.userId,
      });
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderShipped,
        orderId: order.id,
        locationId: order.locationId,
        before: { status: order.status },
        after: {
          status: "SHIPPED",
          courier: input.courier,
          trackingCode: input.trackingCode,
          codAmountPoisha: codAmount,
          invoiceNumber,
        },
      });
      return {
        orderNumber: order.orderNumber,
        invoiceNumber,
        codAmountPoisha: codAmount,
        courierText,
      };
    },
  );
  await notify({
    type: "order.shipped",
    orderNumber: result.orderNumber,
    courier: result.courierText,
    codAmountPoisha: result.codAmountPoisha,
  });
  return {
    orderNumber: result.orderNumber,
    invoiceNumber: result.invoiceNumber,
    codAmountPoisha: result.codAmountPoisha,
  };
}

const bulkShipSchema = z.object({
  courier: z.enum(COURIER_KEYS),
  courierName: z.string().trim().max(60).optional().default(""),
  orders: z
    .array(
      z.object({
        orderId: z.string().min(1).max(40),
        trackingCode: z.string().trim().max(60).optional().default(""),
      }),
    )
    .min(1, "Choose at least one order.")
    .max(100, "At most 100 orders at once."),
});

export type BulkShipResult = Array<
  | { orderId: string; ok: true; orderNumber: string; invoiceNumber: string | null }
  | { orderId: string; ok: false; message: string }
>;

/** Each order in its own transaction: one bad order never blocks the others. */
export async function shipOrders(
  staff: StaffContext,
  raw: unknown,
  meta: RequestMeta,
): Promise<BulkShipResult> {
  assertPermission(staff, "order.fulfil");
  const input = parse(bulkShipSchema, raw);
  const results: BulkShipResult = [];
  for (const line of input.orders) {
    try {
      const shipped = await shipOrder(
        staff,
        line.orderId,
        { courier: input.courier, courierName: input.courierName, trackingCode: line.trackingCode },
        meta,
      );
      results.push({
        orderId: line.orderId,
        ok: true,
        orderNumber: shipped.orderNumber,
        invoiceNumber: shipped.invoiceNumber,
      });
    } catch (error) {
      results.push({
        orderId: line.orderId,
        ok: false,
        message: isAppError(error) ? error.message : "Could not ship this order.",
      });
      if (!isAppError(error))
        console.error("[orders] bulk ship failed", error instanceof Error ? error.name : "");
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// delivery
// ---------------------------------------------------------------------------

export async function markDelivered(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const { version } = parse(versionSchema, raw);
  const delivered = await withLockedOrder(
    staff,
    orderId,
    { version },
    async ({ uow, tx, order }) => {
      assertTransition(staff, order, "DELIVER");
      const at = new Date();
      const shipment = order.shipments[0];
      if (shipment !== undefined) {
        await tx.updateShipment(shipment.id, { status: "DELIVERED", deliveredAt: at });
        await tx.addShipmentEvent({ shipmentId: shipment.id, status: "DELIVERED", note: null });
      }
      // Cash on delivery stays UNPAID until the courier's money is recorded.
      await tx.updateOrder(order.id, { status: "DELIVERED", deliveredAt: at });
      await tx.addHistory({ orderId: order.id, status: "DELIVERED", userId: staff.userId });
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderDelivered,
        orderId: order.id,
        locationId: order.locationId,
        before: { status: order.status },
        after: { status: "DELIVERED" },
      });
      return { orderNumber: order.orderNumber };
    },
  );
  await notify({ type: "order.delivered", orderNumber: delivered.orderNumber });
  return delivered;
}

const failedSchema = z.object({
  version: z.coerce.number().int().min(0),
  reason: z.string().trim().min(3, "Say why it was not delivered.").max(300),
});

export async function markDeliveryFailed(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const input = parse(failedSchema, raw);
  const failed = await withLockedOrder(
    staff,
    orderId,
    { version: input.version },
    async ({ uow, tx, order }) => {
      assertTransition(staff, order, "DELIVERY_FAILED");
      const at = new Date();
      const shipment = order.shipments[0];
      if (shipment !== undefined) {
        await tx.updateShipment(shipment.id, { status: "FAILED", failedReason: input.reason });
        await tx.addShipmentEvent({
          shipmentId: shipment.id,
          status: "FAILED",
          note: input.reason,
        });
      }
      await tx.updateOrder(order.id, {
        status: "DELIVERY_FAILED",
        deliveryFailedAt: at,
        deliveryFailedReason: input.reason,
      });
      await tx.addHistory({
        orderId: order.id,
        status: "DELIVERY_FAILED",
        noteEn: input.reason,
        userId: staff.userId,
      });
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderDeliveryFailed,
        orderId: order.id,
        locationId: order.locationId,
        before: { status: order.status },
        after: { status: "DELIVERY_FAILED", reason: input.reason },
      });
      return { orderNumber: order.orderNumber };
    },
  );
  await notify({ type: "order.delivery_failed", orderNumber: failed.orderNumber });
  return failed;
}

const returnedSchema = z.object({
  version: z.coerce.number().int().min(0),
  /** Where the parcel came back to (the stock goes in there). */
  locationId: z.string().min(1).max(40),
  lines: z
    .array(
      z.object({
        orderItemId: z.string().min(1).max(40),
        good: z.coerce.number().int().min(0).max(1000),
        damaged: z.coerce.number().int().min(0).max(1000),
      }),
    )
    .min(1)
    .max(200),
  /** Taka the courier still charges for the failed delivery. */
  lostCharge: z.string().trim().max(20).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
});

/**
 * The parcel of a failed delivery is back: each unit is inspected. Good units
 * go back on the shelf (RETURN); damaged ones come back and are written off
 * (RETURN then DAMAGE), so the ledger shows both. Every unit must be
 * accounted for. The delivery charge the courier still bills is recorded for
 * the reports.
 */
export async function receiveReturnedParcel(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  const input = parse(returnedSchema, raw);
  assertLocationAccess(staff, input.locationId);
  let lostCharge = 0;
  if (input.lostCharge !== "") {
    const parsed = parseTakaInput(input.lostCharge);
    if (parsed === null || parsed < 0)
      throw invalid("Enter the lost charge in taka.", "lostCharge");
    lostCharge = parsed;
  }
  return withLockedOrder(staff, orderId, { version: input.version }, async ({ uow, tx, order }) => {
    assertTransition(staff, order, "RETURN_TO_WAREHOUSE");
    const location = await tx.findActiveLocation(input.locationId);
    if (location === null) throw invalid("Choose an active location.", "locationId");
    const byItem = new Map(input.lines.map((line) => [line.orderItemId, line]));
    const movements = [];
    const base = {
      locationId: location.id,
      referenceType: "ORDER",
      referenceId: order.id,
      userId: staff.userId,
    };
    for (const item of order.items) {
      const line = byItem.get(item.id);
      if (line === undefined || line.good + line.damaged !== item.quantity) {
        throw invalid(
          `Account for every unit of ${item.sku} (good + damaged = ${item.quantity}).`,
          "lines",
        );
      }
      if (item.variantId === null) continue;
      if (item.quantity > 0) {
        movements.push({
          ...base,
          variantId: item.variantId,
          type: "RETURN" as const,
          quantity: item.quantity,
          reasonCode: "DELIVERY_FAILED",
          reason: `Failed delivery ${order.orderNumber} back`,
        });
      }
      if (line.damaged > 0) {
        movements.push({
          ...base,
          variantId: item.variantId,
          type: "DAMAGE" as const,
          quantity: -line.damaged,
          reasonCode: "DAMAGED",
          reason: `Damaged in failed delivery ${order.orderNumber}`,
        });
      }
    }
    if (byItem.size !== order.items.length)
      throw invalid("Unknown line in the inspection.", "lines");
    if (movements.length > 0) await applyStockMovements(uow, movements);
    const at = new Date();
    const shipment = order.shipments[0];
    if (shipment !== undefined) {
      await tx.updateShipment(shipment.id, {
        status: "RETURNED",
        returnedAt: at,
        lostChargePoisha: lostCharge,
      });
      await tx.addShipmentEvent({
        shipmentId: shipment.id,
        status: "RETURNED",
        note: input.note || null,
      });
    }
    await tx.updateOrder(order.id, { status: "RETURNED_TO_WAREHOUSE", returnedToWarehouseAt: at });
    const damaged = input.lines.reduce((sum, line) => sum + line.damaged, 0);
    const good = input.lines.reduce((sum, line) => sum + line.good, 0);
    await tx.addHistory({
      orderId: order.id,
      status: "RETURNED_TO_WAREHOUSE",
      noteEn: `Back at ${location.code}: ${good} good, ${damaged} damaged.${input.note === "" ? "" : ` ${input.note}`}`,
      userId: staff.userId,
    });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderReturnedToWarehouse,
      orderId: order.id,
      locationId: location.id,
      before: { status: order.status },
      after: {
        status: "RETURNED_TO_WAREHOUSE" satisfies OrderStatus,
        good,
        damaged,
        lostChargePoisha: lostCharge,
      },
    });
    return { orderNumber: order.orderNumber, good, damaged };
  });
}
