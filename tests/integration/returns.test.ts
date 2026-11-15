import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import { getInvoiceForPrint } from "@/modules/invoices/invoice.service";
import { recordCodSettlement } from "@/modules/orders/cod-settlement.service";
import {
  markDelivered,
  markPacked,
  shipOrder,
  startPacking,
} from "@/modules/orders/fulfilment.service";
import { confirmOrder } from "@/modules/orders/orders.service";
import { decideRefund, recordRefund } from "@/modules/returns/refund.service";
import {
  approveReturn,
  closeReturn,
  createCustomerReturn,
  createStaffReturn,
  getCustomerReturnOptions,
  inspectReturn,
  isReturnPolicyPublished,
  issueReturnToken,
  receiveReturn,
  rejectReturn,
  setReturnPolicy,
} from "@/modules/returns/returns.service";
import {
  caught,
  createFixture,
  placeTestOrder,
  runId,
  staffFor,
  stockOf,
  testMeta,
  type Fixture,
} from "./order-fixture";

/**
 * Phase 9 step B-2 against the real test database: returns valued with the
 * discount share, refunds never above what was collected (service and
 * database), approval above the limit, exchanges with their replacement
 * order, the customer's request from the tracking page, invoices and the
 * return policy switch. The ledger must still match at the end.
 */

const RUN = runId();
let fixture: Fixture;
let manager: StaffContext;
let clerk: StaffContext;
let otherBranch: StaffContext;
const meta = testMeta;
const policyBefore = new Map<string, string | null>();

async function version(orderId: string) {
  return (await db.order.findUniqueOrThrow({ where: { id: orderId } })).version;
}

/** Placed, confirmed, packed, shipped and delivered; optionally the courier paid. */
async function deliveredOrder(
  lines: Array<[string, number]>,
  options: { couponCode?: string; settle?: boolean } = {},
) {
  const order = await placeTestOrder(
    fixture,
    lines,
    options.couponCode === undefined ? {} : { couponCode: options.couponCode },
  );
  await confirmOrder(manager, order.id, { version: await version(order.id) }, meta());
  await startPacking(manager, order.id, { version: await version(order.id) }, meta());
  const items = await db.orderItem.findMany({ where: { orderId: order.id } });
  await markPacked(
    manager,
    order.id,
    {
      version: await version(order.id),
      counted: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    },
    meta(),
  );
  await shipOrder(
    manager,
    order.id,
    { courier: "STEADFAST", trackingCode: `SF-${order.id.slice(-8)}` },
    meta(),
  );
  await markDelivered(manager, order.id, { version: await version(order.id) }, meta());
  if (options.settle !== false) {
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await recordCodSettlement(
      manager,
      {
        courier: "STEADFAST",
        receivedOn: "2026-11-16",
        received: String(saved.totalPoisha / 100),
        orders: [{ orderId: order.id }],
      },
      meta(),
    );
  }
  return db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: { orderBy: { id: "asc" } } },
  });
}

function itemOf(order: { items: Array<{ id: string; variantId: string | null }> }, key: string) {
  return order.items.find((item) => item.variantId === fixture.variants[key])!;
}

beforeAll(async () => {
  fixture = await createFixture(RUN, {
    M: [150_000, 50],
    L: [150_000, 50],
    PANT: [200_000, 50],
    DEAR: [900_000, 10],
  });
  manager = await staffFor(RUN, "Store Manager");
  clerk = await staffFor(RUN, "Order Staff", {
    permissions: ["order.read", "return.manage", "refund.record"],
    locationIds: [fixture.locationId],
  });
  const second = await db.location.create({
    data: { code: `IR-${RUN.slice(-8)}`, type: "BRANCH", nameEn: `Return branch ${RUN}` },
  });
  otherBranch = await staffFor(RUN, "Branch Manager", { locationIds: [second.id] });
  await db.coupon.create({
    data: { code: `RET${RUN}`, type: "PERCENTAGE", value: 10, channel: "ONLINE" },
  });
  for (const key of ["returns.policyApproved"]) {
    policyBefore.set(key, (await db.setting.findUnique({ where: { key } }))?.value ?? null);
  }
});

afterAll(async () => {
  for (const [key, value] of policyBefore) {
    if (value === null) await db.setting.deleteMany({ where: { key } });
    else await db.setting.update({ where: { key }, data: { value } });
  }
  await db.$disconnect();
});

describe("returns and refunds", () => {
  it("values a returned unit net of its discount share, restocks it and refunds once", async () => {
    // Shirt ৳1,500 × 2 + pant ৳2,000 with 10% off: the shirt line carries ৳300.
    const order = await deliveredOrder(
      [
        ["M", 2],
        ["PANT", 1],
      ],
      { couponCode: `RET${RUN}` },
    );
    expect(order.discountPoisha).toBe(50_000);
    const shirt = itemOf(order, "M");
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "SIZE_MISMATCH",
        items: [{ orderItemId: shirt.id, quantity: 1 }],
      },
      meta(),
    );
    // Not more than was bought, across requests.
    expect(
      (
        await caught(
          createStaffReturn(
            clerk,
            {
              orderId: order.id,
              type: "RETURN",
              reasonCode: "SIZE_MISMATCH",
              items: [{ orderItemId: shirt.id, quantity: 2 }],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");

    await approveReturn(clerk, created.id, meta());
    const approved = await db.returnItem.findFirstOrThrow({
      where: { returnRequestId: created.id },
    });
    expect(approved.creditPoisha).toBe(135_000);
    // Nothing to refund before the item is inspected.
    expect(
      (await caught(recordRefund(clerk, created.id, { method: "BKASH", reference: "TX1" }, meta())))
        .code,
    ).toBe("CONFLICT");

    await receiveReturn(clerk, created.id, meta());
    const before = await stockOf(fixture.variants.M!, fixture.locationId);
    await inspectReturn(
      clerk,
      created.id,
      {
        locationId: fixture.locationId,
        items: [{ returnItemId: approved.id, result: "ACCEPTED" }],
      },
      meta(),
    );
    expect((await stockOf(fixture.variants.M!, fixture.locationId)).onHand).toBe(before.onHand + 1);

    expect(
      (await caught(recordRefund(clerk, created.id, { method: "BKASH", reference: "" }, meta())))
        .code,
    ).toBe("VALIDATION_FAILED");
    const refund = await recordRefund(
      clerk,
      created.id,
      { method: "BKASH", reference: "TXN-123" },
      meta(),
    );
    expect(refund).toMatchObject({ amountPoisha: 135_000, pending: false });
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.refundedPoisha).toBe(135_000);
    expect(saved.paymentStatus).toBe("PARTIALLY_REFUNDED");
    await closeReturn(clerk, created.id, meta());
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "COMPLETED",
    );
  });

  it("refunds the delivery charge once on a defective item and writes damaged units off", async () => {
    const order = await deliveredOrder([["PANT", 1]]);
    const pant = itemOf(order, "PANT");
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "DEFECTIVE",
        items: [{ orderItemId: pant.id, quantity: 1 }],
      },
      meta(),
    );
    await approveReturn(clerk, created.id, meta());
    await receiveReturn(clerk, created.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: created.id } });
    const before = await stockOf(fixture.variants.PANT!, fixture.locationId);
    await inspectReturn(
      clerk,
      created.id,
      { locationId: fixture.locationId, items: [{ returnItemId: item.id, result: "DAMAGED" }] },
      meta(),
    );
    expect((await stockOf(fixture.variants.PANT!, fixture.locationId)).onHand).toBe(before.onHand);
    const movements = await db.inventoryMovement.findMany({
      where: { referenceType: "RETURN", referenceId: created.id },
    });
    expect(movements.map((row) => [row.type, row.quantity]).sort()).toEqual([
      ["DAMAGE", -1],
      ["RETURN", 1],
    ]);
    const refund = await recordRefund(clerk, created.id, { method: "CASH" }, meta());
    expect(refund.amountPoisha).toBe(200_000 + order.shippingPoisha);
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.refundedPoisha).toBe(saved.paidPoisha);
    expect(saved.paymentStatus).toBe("REFUNDED");
  });

  it("never refunds more than was collected — in the service and in the database", async () => {
    const order = await deliveredOrder([["PANT", 1]], { settle: false });
    const pant = itemOf(order, "PANT");
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "OTHER",
        items: [{ orderItemId: pant.id, quantity: 1 }],
      },
      meta(),
    );
    await approveReturn(clerk, created.id, meta());
    await receiveReturn(clerk, created.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: created.id } });
    await inspectReturn(
      clerk,
      created.id,
      { locationId: fixture.locationId, items: [{ returnItemId: item.id, result: "ACCEPTED" }] },
      meta(),
    );
    const refused = await caught(
      recordRefund(clerk, created.id, { method: "NAGAD", reference: "NG-1" }, meta()),
    );
    expect(refused.message).toMatch(/more than the money collected/);
    // The CHECK constraint is the last line of defence.
    await expect(
      db.order.update({ where: { id: order.id }, data: { refundedPoisha: 1 } }),
    ).rejects.toThrow();
  });

  it("waits for approval above ৳5,000 unless the recorder may approve", async () => {
    const order = await deliveredOrder([["DEAR", 1]]);
    const dear = itemOf(order, "DEAR");
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "CHANGED_MIND",
        items: [{ orderItemId: dear.id, quantity: 1 }],
      },
      meta(),
    );
    await approveReturn(clerk, created.id, meta());
    await receiveReturn(clerk, created.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: created.id } });
    await inspectReturn(
      clerk,
      created.id,
      { locationId: fixture.locationId, items: [{ returnItemId: item.id, result: "ACCEPTED" }] },
      meta(),
    );
    const refund = await recordRefund(
      clerk,
      created.id,
      { method: "BANK_TRANSFER", reference: "BT-9" },
      meta(),
    );
    expect(refund.pending).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).refundedPoisha).toBe(0);
    expect((await caught(closeReturn(clerk, created.id, meta()))).code).toBe("CONFLICT");
    expect(
      (await caught(decideRefund(clerk, refund.refundId, { approve: true }, meta()))).code,
    ).toBe("FORBIDDEN");
    await decideRefund(manager, refund.refundId, { approve: true }, meta());
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.refundId } })).status).toBe(
      "COMPLETED",
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).refundedPoisha).toBe(
      900_000,
    );
    expect(
      (await caught(decideRefund(manager, refund.refundId, { approve: true }, meta()))).code,
    ).toBe("CONFLICT");
  });

  it("refuses a request with a reason and lets another branch see nothing", async () => {
    const order = await deliveredOrder([["L", 1]]);
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "CHANGED_MIND",
        items: [{ orderItemId: itemOf(order, "L").id, quantity: 1 }],
      },
      meta(),
    );
    expect((await caught(approveReturn(otherBranch, created.id, meta()))).code).toBe(
      "LOCATION_FORBIDDEN",
    );
    await rejectReturn(clerk, created.id, { reason: "Worn and washed" }, meta());
    expect((await caught(approveReturn(clerk, created.id, meta()))).code).toBe("CONFLICT");
  });
});

describe("exchanges", () => {
  it("swaps a size: replacement order costs only delivery, stock is reserved, credit is paid", async () => {
    const order = await deliveredOrder([["M", 1]], { couponCode: `RET${RUN}` });
    const beforeL = await stockOf(fixture.variants.L!, fixture.locationId);
    const created = await createStaffReturn(
      clerk,
      {
        orderId: order.id,
        type: "EXCHANGE",
        reasonCode: "SIZE_MISMATCH",
        items: [
          {
            orderItemId: itemOf(order, "M").id,
            quantity: 1,
            exchangeVariantId: fixture.variants.L,
          },
        ],
      },
      meta(),
    );
    const approved = await approveReturn(clerk, created.id, meta());
    expect(approved.exchange).not.toBeNull();
    const replacement = await db.order.findUniqueOrThrow({
      where: { id: approved.exchange!.id },
      include: { items: true, payments: true },
    });
    expect(replacement.exchangeOfOrderId).toBe(order.id);
    expect(replacement.status).toBe("CONFIRMED");
    expect(replacement.items[0]).toMatchObject({
      variantId: fixture.variants.L,
      unitPricePoisha: 150_000,
      discountPoisha: 15_000,
    });
    const credit = replacement.payments.find((payment) => payment.provider === "EXCHANGE_CREDIT");
    expect(credit?.amountPoisha).toBe(135_000);
    expect(replacement.totalPoisha - replacement.paidPoisha).toBe(replacement.shippingPoisha);
    expect((await stockOf(fixture.variants.L!, fixture.locationId)).reserved).toBe(
      beforeL.reserved + 1,
    );

    // It may ship before the old item is back, but only with a note.
    await startPacking(manager, replacement.id, { version: replacement.version }, meta());
    await markPacked(
      manager,
      replacement.id,
      {
        version: await version(replacement.id),
        counted: [{ variantId: fixture.variants.L!, quantity: 1 }],
      },
      meta(),
    );
    expect(
      (await caught(shipOrder(manager, replacement.id, { courier: "MANUAL" }, meta()))).message,
    ).toMatch(/has not arrived yet/);
    await shipOrder(
      manager,
      replacement.id,
      { courier: "MANUAL", note: "Rider brings the old shirt back" },
      meta(),
    );
    const shipped = await db.shipment.findFirstOrThrow({ where: { orderId: replacement.id } });
    expect(shipped.codAmountPoisha).toBe(replacement.shippingPoisha);

    await receiveReturn(clerk, created.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: created.id } });
    await inspectReturn(
      clerk,
      created.id,
      { locationId: fixture.locationId, items: [{ returnItemId: item.id, result: "ACCEPTED" }] },
      meta(),
    );
    // Nothing is owed: the credit went to the new order.
    await closeReturn(clerk, created.id, meta());
  });
});

describe("customer request from the tracking page", () => {
  it("offers eligible items and accepts a request only with a valid token and the right phone", async () => {
    const order = await deliveredOrder([["M", 1]]);
    const options = await getCustomerReturnOptions(order.id);
    expect(options).not.toBeNull();
    expect(
      options!.items[0]?.exchangeOptions.some((option) => option.variantId === fixture.variants.L),
    ).toBe(true);
    const local = order.customerPhone.replace("+88", "");
    const base = {
      token: options!.token,
      type: "RETURN",
      reasonCode: "SIZE_MISMATCH",
      items: [{ orderItemId: options!.items[0]!.orderItemId, quantity: 1 }],
    };
    expect(
      await createCustomerReturn({ ...base, phone: "01999999999" }, [], meta(), `ip-${RUN}-1`),
    ).toEqual({
      ok: false,
      error: "NOT_ALLOWED",
    });
    expect(
      await createCustomerReturn(
        { ...base, phone: local, token: issueReturnToken(order.id, Date.now() - 3_600_000) },
        [],
        meta(),
        `ip-${RUN}-2`,
      ),
    ).toEqual({ ok: false, error: "EXPIRED" });
    expect(
      await createCustomerReturn(
        { ...base, phone: local, token: `${base.token}x` },
        [],
        meta(),
        `ip-${RUN}-3`,
      ),
    ).toEqual({ ok: false, error: "EXPIRED" });
    const sent = await createCustomerReturn({ ...base, phone: local }, [], meta(), `ip-${RUN}-4`);
    expect(sent.ok).toBe(true);
    const request = await db.returnRequest.findFirstOrThrow({ where: { orderId: order.id } });
    expect(request).toMatchObject({ source: "CUSTOMER", status: "REQUESTED" });
    // The unit is now requested: nothing left to offer.
    expect(await getCustomerReturnOptions(order.id)).toBeNull();
  });

  it("limits requests per IP", async () => {
    const results = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      results.push(await createCustomerReturn({}, [], meta(), `flood-${RUN}`));
    }
    expect(results.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
  });
});

describe("invoices and the return policy", () => {
  it("prints the issued snapshot and refuses another branch", async () => {
    const order = await deliveredOrder([["PANT", 1]], { settle: false });
    const invoice = await getInvoiceForPrint(manager, order.id);
    expect(invoice.snapshot.number).toMatch(/^INV-\d{4}-\d{5,}$/);
    expect(invoice.snapshot.totals.totalPoisha).toBe(order.totalPoisha);
    expect(invoice.snapshot.order.orderNumber).toBe(order.orderNumber);
    expect((await caught(getInvoiceForPrint(otherBranch, order.id))).code).toBe("FORBIDDEN");
  });

  it("publishes the policy only with return.policy.publish, audited", async () => {
    expect((await caught(setReturnPolicy(clerk, true, meta()))).code).toBe("FORBIDDEN");
    await setReturnPolicy(manager, true, meta());
    expect(await isReturnPolicyPublished()).toBe(true);
    await setReturnPolicy(manager, false, meta());
    expect(await isReturnPolicyPublished()).toBe(false);
    expect(
      await db.auditLog.count({
        where: {
          action: { in: ["return_policy.published", "return_policy.unpublished"] },
          userId: manager.userId,
        },
      }),
    ).toBe(2);
  });
});

describe("ledger", () => {
  it("still matches every stock row", async () => {
    expect((await findLedgerMismatches(db)).mismatches).toEqual([]);
  });
});
