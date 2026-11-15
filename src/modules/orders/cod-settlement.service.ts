import "server-only";

import { z } from "zod";

import { parseTakaInput } from "@/lib/money";
import {
  assertLocationAccess,
  assertPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { formatOrderNumber } from "@/modules/checkout/checkout-rules";
import { parse } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { COURIER_KEYS } from "@/modules/settings/order-settings";
import { conflict, invalid } from "./order-context";
import { settleCod, type SettlementProblem } from "./order-rules";
import { findUnsettledCodOrders, listSettlements, OrderTx } from "./orders.repository";

/**
 * Courier cash: the courier collects cash on delivery and later pays the shop
 * (minus its charges). Recording that payment marks the orders PAID. An order
 * paid short stays UNPAID with what arrived recorded, and any mismatch
 * between the courier's total and the orders is kept and flagged.
 */

export const COD_SETTLEMENT_PREFIX = "COD";

export async function getCodWorkspace(staff: StaffContext) {
  assertPermission(staff, "order.cod.reconcile");
  const scope = locationScope(staff);
  const [unsettled, settlements] = await Promise.all([
    findUnsettledCodOrders(scope),
    listSettlements(),
  ]);
  return {
    unsettled: unsettled.map((order) => {
      const shipment = order.shipments[0];
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveredAt: order.deliveredAt,
        courier: shipment?.courier ?? null,
        courierName: shipment?.courierName ?? null,
        trackingCode: shipment?.trackingCode ?? null,
        expectedPoisha: shipment?.codAmountPoisha ?? order.totalPoisha,
      };
    }),
    settlements,
  };
}

const settlementSchema = z.object({
  courier: z.enum(COURIER_KEYS, { error: "Choose the courier." }),
  courierName: z.string().trim().max(60).optional().default(""),
  receivedOn: z.iso.date({ error: "Enter the date the money arrived." }),
  received: z.string().trim().min(1, "Enter the amount received.").max(20),
  courierCharge: z.string().trim().max(20).optional().default(""),
  courierReference: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  orders: z
    .array(
      z.object({
        orderId: z.string().min(1).max(40),
        /** Blank: the courier paid this order in full. */
        received: z.string().trim().max(20).optional().default(""),
      }),
    )
    .min(1, "Choose at least one order.")
    .max(500),
});

const PROBLEM_TEXT: Record<SettlementProblem, string> = {
  EMPTY: "Choose at least one order.",
  NEGATIVE: "Amounts cannot be negative.",
  ABOVE_EXPECTED: "An order cannot receive more than its cash-on-delivery amount.",
  DUPLICATE_ORDER: "An order is listed twice.",
};

function taka(text: string, field: string): number {
  const value = parseTakaInput(text);
  if (value === null || value < 0) throw invalid("Enter an amount in taka.", field);
  return value;
}

export async function recordCodSettlement(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "order.cod.reconcile");
  const input = parse(settlementSchema, raw);
  if (input.courier === "OTHER" && input.courierName.length < 2) {
    throw invalid("Write the courier's name.", "courierName");
  }
  const received = taka(input.received, "received");
  const charge = input.courierCharge === "" ? 0 : taka(input.courierCharge, "courierCharge");

  return runInventoryTransaction(async (uow) => {
    const tx = new OrderTx(uow);
    const orders = await tx.lockOrders(input.orders.map((line) => line.orderId));
    if (orders.length !== new Set(input.orders.map((line) => line.orderId)).size) {
      throw invalid("An order was not found.");
    }
    const byId = new Map(orders.map((order) => [order.id, order]));
    const lines = input.orders.map((line) => {
      const order = byId.get(line.orderId)!;
      assertLocationAccess(staff, order.locationId);
      if (
        order.channel !== "ONLINE" ||
        order.status !== "DELIVERED" ||
        order.paymentMethod !== "COD" ||
        order.paymentStatus !== "UNPAID"
      ) {
        throw conflict(`${order.orderNumber} is not a delivered, unpaid cash-on-delivery order.`);
      }
      if (order.codItem !== null) {
        throw conflict(`${order.orderNumber} is already in a courier settlement.`);
      }
      const shipment = order.shipments[0];
      const expected = shipment?.codAmountPoisha ?? order.totalPoisha - order.paidPoisha;
      return {
        order,
        shipmentId: shipment?.id ?? null,
        expectedPoisha: expected,
        receivedPoisha: line.received === "" ? expected : taka(line.received, "orders"),
      };
    });
    const settled = settleCod({
      lines: lines.map((line) => ({
        orderId: line.order.id,
        expectedPoisha: line.expectedPoisha,
        receivedPoisha: line.receivedPoisha,
      })),
      receivedPoisha: received,
      courierChargePoisha: charge,
    });
    if (!settled.ok) throw invalid(PROBLEM_TEXT[settled.problem]);
    const now = new Date();
    const receivedOn = new Date(`${input.receivedOn}T00:00:00Z`);
    const reference = formatOrderNumber(COD_SETTLEMENT_PREFIX, now, await tx.nextSequence("cod"));
    const settlement = await tx.createSettlement({
      reference,
      courier: input.courier,
      courierName: input.courier === "OTHER" ? input.courierName : null,
      receivedOn,
      expectedPoisha: settled.result.expectedPoisha,
      receivedPoisha: received,
      courierChargePoisha: charge,
      differencePoisha: settled.result.differencePoisha,
      courierReference: input.courierReference === "" ? null : input.courierReference,
      note: input.note === "" ? null : input.note,
      createdByUserId: staff.userId,
      items: {
        create: lines.map((line) => ({
          orderId: line.order.id,
          shipmentId: line.shipmentId,
          expectedPoisha: line.expectedPoisha,
          receivedPoisha: line.receivedPoisha,
        })),
      },
    });
    const paid = new Set(settled.result.paidOrderIds);
    for (const line of lines) {
      const full = paid.has(line.order.id);
      if (full) await tx.markCodPaid(line.order.id, reference, now);
      await tx.updateOrder(line.order.id, {
        paidPoisha: { increment: line.receivedPoisha },
        ...(full ? { paymentStatus: "PAID" } : {}),
      });
      await tx.addHistory({
        orderId: line.order.id,
        status: "DELIVERED",
        event: "COD_SETTLED",
        noteEn: full
          ? `Courier paid in full (${reference}).`
          : `Courier paid ${line.receivedPoisha / 100} of ${line.expectedPoisha / 100} taka (${reference}); still unpaid.`,
        userId: staff.userId,
      });
    }
    await uow.audit({
      userId: staff.userId,
      action: AUDIT_ACTIONS.codSettled,
      entityType: "cod_settlement",
      entityId: settlement.id,
      after: {
        reference,
        courier: input.courier,
        orders: lines.map((line) => line.order.orderNumber),
        expectedPoisha: settled.result.expectedPoisha,
        receivedPoisha: received,
        courierChargePoisha: charge,
        differencePoisha: settled.result.differencePoisha,
        shortOrders: settled.result.shortOrderIds.length,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      reference,
      differencePoisha: settled.result.differencePoisha,
      paidOrders: settled.result.paidOrderIds.length,
      shortOrders: settled.result.shortOrderIds.length,
    };
  });
}
