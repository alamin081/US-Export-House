import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { parse } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { notify } from "@/modules/notifications/notification.service";
import { conflict, invalid } from "@/modules/orders/order-context";
import { OrderTx } from "@/modules/orders/orders.repository";
import { getReturnsSettings } from "@/modules/settings/settings.service";
import {
  needsApproval,
  paymentStatusAfterRefund,
  planRefund,
  REFUND_METHODS,
} from "./return-rules";
import { findExchangeCreditPayment, listPendingRefunds, ReturnTx } from "./returns.repository";
import { outstandingRefund } from "./returns.service";

/**
 * Refunds are recorded, not sent: the money moves by bKash, Nagad, bank
 * transfer or cash outside the app, and staff record it here with the
 * reference. The amount is computed, never typed: the inspected units'
 * credit plus, on the shop's fault, the delivery charge. Above
 * `refund.approvalAbovePoisha` a refund waits for `refund.approve`. The
 * database refuses refunds above what was collected (Order_refunded_lte_paid).
 */

const recordSchema = z
  .object({
    method: z.enum(REFUND_METHODS, { error: "Choose how the money was sent." }),
    reference: z.string().trim().max(80).optional().default(""),
    note: z.string().trim().max(300).optional().default(""),
    /** Cash handed back from a till drawer: that open day (counted in its Z-report). */
    posSessionId: z.string().max(40).optional().default(""),
  })
  .refine((value) => value.posSessionId === "" || value.method === "CASH", {
    message: "Only cash comes out of the till drawer.",
    path: ["posSessionId"],
  })
  .refine((value) => value.method === "CASH" || value.reference.length >= 3, {
    message: "Enter the transaction or reference number.",
    path: ["reference"],
  });

export async function recordRefund(
  staff: StaffContext,
  returnId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "refund.record");
  const input = parse(recordSchema, raw);
  const settings = await getReturnsSettings();
  const result = await runInventoryTransaction(async (uow) => {
    const tx = new ReturnTx(uow);
    const orderTx = new OrderTx(uow);
    const orderId = await tx.orderIdOfReturn(returnId);
    if (orderId === null) throw new AppError("NOT_FOUND", "Return not found.");
    // Lock order: order -> return request -> refunds.
    const order = await orderTx.lockOrder(orderId);
    if (order === null) throw new AppError("NOT_FOUND", "Order not found.");
    assertLocationAccess(staff, order.locationId);
    const request = await tx.lockReturn(returnId);
    if (request === null) throw new AppError("NOT_FOUND", "Return not found.");
    if (request.status !== "INSPECTED") throw conflict("Inspect the returned items first.");
    if (input.posSessionId !== "") {
      const day = await tx.findOpenSession(input.posSessionId);
      if (day === null || day.locationId !== order.locationId) {
        throw invalid("Choose an open till day at the shop that made the sale.", "posSessionId");
      }
    }
    if (request.refunds.some((refund) => refund.status === "PENDING")) {
      throw conflict("A refund for this return is already waiting for approval.");
    }
    const creditUsed =
      request.exchangeOrderId === null
        ? 0
        : await findExchangeCreditPayment(request.exchangeOrderId);
    const itemsOwed = outstandingRefund({ ...request, exchangeCreditUsedPoisha: creditUsed });
    const plan = planRefund({
      acceptedCredits: itemsOwed > 0 ? [itemsOwed] : [],
      reason: request.reasonCode,
      orderShippingPoisha: order.shippingPoisha,
      shippingAlreadyRefunded: await tx.shippingRefunded(order.id),
      refundShippingOnFault: settings.refundShippingOnFault,
      refundablePoisha: order.paidPoisha - order.refundedPoisha,
    });
    if (!plan.ok) {
      throw invalid(
        plan.problem === "NOTHING"
          ? "Nothing to refund for this return."
          : "The refund would be more than the money collected for this order. Record the courier's cash first.",
      );
    }
    const pending = needsApproval({
      amountPoisha: plan.plan.totalPoisha,
      approvalAbovePoisha: settings.refundApprovalAbovePoisha,
      recorderCanApprove: hasPermission(staff, "refund.approve"),
    });
    const at = new Date();
    const refund = await tx.createRefund({
      orderId: order.id,
      paymentId: await tx.firstPaidPaymentId(order.id),
      returnRequestId: request.id,
      method: input.method,
      status: pending ? "PENDING" : "COMPLETED",
      amountPoisha: plan.plan.totalPoisha,
      shippingRefundPoisha: plan.plan.shippingPoisha,
      reference: input.reference === "" ? null : input.reference,
      note: input.note === "" ? null : input.note,
      requiresApproval: pending,
      posSessionId: input.posSessionId === "" ? null : input.posSessionId,
      processedByUserId: staff.userId,
      processedAt: pending ? null : at,
      ...(pending ? {} : { approvedByUserId: staff.userId, approvedAt: at }),
    });
    if (!pending) {
      const refunded = order.refundedPoisha + plan.plan.totalPoisha;
      await tx.addRefundToOrder(
        order.id,
        plan.plan.totalPoisha,
        paymentStatusAfterRefund(order.paidPoisha, refunded),
      );
    }
    await uow.audit({
      userId: staff.userId,
      action: AUDIT_ACTIONS.refundRecorded,
      entityType: "refund",
      entityId: refund.id,
      locationId: order.locationId,
      after: {
        order: order.orderNumber,
        return: request.reference,
        method: input.method,
        amountPoisha: plan.plan.totalPoisha,
        shippingPoisha: plan.plan.shippingPoisha,
        status: pending ? "PENDING" : "COMPLETED",
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      refundId: refund.id,
      orderNumber: order.orderNumber,
      amountPoisha: plan.plan.totalPoisha,
      pending,
    };
  });
  if (!result.pending) {
    await notify({
      type: "refund.recorded",
      orderNumber: result.orderNumber,
      amountPoisha: result.amountPoisha,
    });
  }
  return result;
}

const decideSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(300).optional().default(""),
});

/** A Store Manager approves (the refund completes) or refuses (with a reason). */
export async function decideRefund(
  staff: StaffContext,
  refundId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "refund.approve");
  const input = parse(decideSchema, raw);
  if (!input.approve && input.reason.length < 3) {
    throw invalid("Say why the refund is refused.", "reason");
  }
  const result = await runInventoryTransaction(async (uow) => {
    const tx = new ReturnTx(uow);
    const orderTx = new OrderTx(uow);
    const orderId = await tx.refundIdsOfOrder(refundId);
    if (orderId === null) throw new AppError("NOT_FOUND", "Refund not found.");
    const order = await orderTx.lockOrder(orderId);
    if (order === null) throw new AppError("NOT_FOUND", "Order not found.");
    assertLocationAccess(staff, order.locationId);
    const refund = await tx.lockRefund(refundId);
    if (refund === null) throw new AppError("NOT_FOUND", "Refund not found.");
    if (refund.status !== "PENDING") throw conflict("This refund was already decided.");
    const at = new Date();
    if (input.approve) {
      if (order.refundedPoisha + refund.amountPoisha > order.paidPoisha) {
        throw invalid("The refund is more than what is left of the money collected.");
      }
      await tx.updateRefund(refund.id, {
        status: "COMPLETED",
        approvedByUserId: staff.userId,
        approvedAt: at,
        processedAt: at,
      });
      await tx.addRefundToOrder(
        order.id,
        refund.amountPoisha,
        paymentStatusAfterRefund(order.paidPoisha, order.refundedPoisha + refund.amountPoisha),
      );
    } else {
      await tx.updateRefund(refund.id, { status: "REJECTED", rejectedReason: input.reason });
    }
    await uow.audit({
      userId: staff.userId,
      action: input.approve ? AUDIT_ACTIONS.refundApproved : AUDIT_ACTIONS.refundRejected,
      entityType: "refund",
      entityId: refund.id,
      locationId: order.locationId,
      before: { status: "PENDING" },
      after: {
        status: input.approve ? "COMPLETED" : "REJECTED",
        amountPoisha: refund.amountPoisha,
        reason: input.reason || null,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { orderNumber: order.orderNumber, amountPoisha: refund.amountPoisha };
  });
  if (input.approve) await notify({ type: "refund.recorded", ...result });
  return result;
}

export async function listPendingRefundsForStaff(staff: StaffContext) {
  assertPermission(staff, "refund.approve");
  return listPendingRefunds(locationScope(staff));
}
