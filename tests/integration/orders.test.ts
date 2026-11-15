import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES } from "@/modules/access/permissions";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import {
  setNotificationSink,
  type NotificationEvent,
} from "@/modules/notifications/notification.service";
import { getCodWorkspace, recordCodSettlement } from "@/modules/orders/cod-settlement.service";
import {
  markDelivered,
  markDeliveryFailed,
  markPacked,
  receiveReturnedParcel,
  shipOrder,
  shipOrders,
  startPacking,
  unpackOrder,
} from "@/modules/orders/fulfilment.service";
import {
  changeFulfilmentLocation,
  correctAddress,
  editOrder,
} from "@/modules/orders/order-edit.service";
import {
  cancelOrder,
  confirmOrder,
  getCustomerView,
  getOrderForStaff,
  listOrdersForStaff,
  logCall,
} from "@/modules/orders/orders.service";
import {
  caught,
  createFixture,
  runId,
  staffFor,
  stockOf,
  testMeta,
  type Fixture,
} from "./order-fixture";
import { placeTestOrder } from "./order-fixture";

/**
 * Phase 9 step B-1 against the real test database: the state machine on
 * locked rows, races, edits that roll back, location moves, shipping (stock
 * leaves, invoice issued), failed deliveries back into stock, courier cash
 * and location access. The ledger must still match at the end.
 */

const RUN = runId();
let fixture: Fixture;
let orderStaff: StaffContext;
let manager: StaffContext;
let otherBranch: StaffContext;
let secondLocationId = "";
const events: NotificationEvent[] = [];
const meta = testMeta;

async function fresh(lines: Array<[string, number]>, couponCode?: string) {
  return placeTestOrder(fixture, lines, couponCode === undefined ? {} : { couponCode });
}

async function version(orderId: string) {
  return (await db.order.findUniqueOrThrow({ where: { id: orderId } })).version;
}

async function toPacked(orderId: string) {
  await confirmOrder(orderStaff, orderId, { version: await version(orderId) }, meta());
  await startPacking(orderStaff, orderId, { version: await version(orderId) }, meta());
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  await markPacked(
    orderStaff,
    orderId,
    {
      version: order.version,
      counted: order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    },
    meta(),
  );
}

beforeAll(async () => {
  setNotificationSink((event) => {
    events.push(event);
  });
  fixture = await createFixture(RUN, {
    M: [150_000, 50],
    L: [160_000, 50],
    PANT: [200_000, 50],
    LAST: [90_000, 1],
    FEW: [70_000, 2],
  });
  const second = await db.location.create({
    data: {
      code: `IT-${RUN.slice(-8)}`,
      type: "WAREHOUSE",
      nameEn: `Second warehouse ${RUN}`,
      isOnlineFulfillment: true,
    },
  });
  secondLocationId = second.id;
  orderStaff = await staffFor(RUN, "Order Staff", { locationIds: [fixture.locationId, second.id] });
  manager = await staffFor(RUN, "Store Manager");
  otherBranch = await staffFor(RUN, "Order Staff", { locationIds: [second.id] });
  await db.coupon.create({
    data: {
      code: `ORD${RUN}`,
      type: "PERCENTAGE",
      value: 10,
      channel: "ONLINE",
      minSubtotalPoisha: 300_000,
    },
  });
});

afterAll(async () => {
  setNotificationSink(null);
  await db.$disconnect();
});

describe("roles", () => {
  it("database roles hold exactly the permissions the code defines", async () => {
    for (const definition of SYSTEM_ROLES) {
      const role = await db.role.findFirstOrThrow({ where: { name: definition.name } });
      expect([...role.permissions].sort()).toEqual([...definition.permissions].sort());
    }
  });
});

describe("confirm, calls and cancel", () => {
  it("cancelling gives the reservation and the coupon use back", async () => {
    const order = await fresh(
      [
        ["M", 1],
        ["PANT", 1],
      ],
      `ORD${RUN}`,
    );
    expect(order.couponCode).toBe(`ORD${RUN}`);
    const coupon = await db.coupon.findUniqueOrThrow({ where: { code: `ORD${RUN}` } });
    const before = await stockOf(fixture.variants.M!, fixture.locationId);
    await cancelOrder(
      orderStaff,
      order.id,
      { version: order.version, reason: "CUSTOMER_DECLINED" },
      meta(),
    );
    const after = await stockOf(fixture.variants.M!, fixture.locationId);
    expect(after.reserved).toBe(before.reserved - 1);
    expect(after.onHand).toBe(before.onHand);
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(
      coupon.usedCount - 1,
    );
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe("CANCELLED");
    expect(saved.cancelReason).toBe("CUSTOMER_DECLINED");
    expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(0);
    expect(events.some((event) => event.type === "order.cancelled")).toBe(true);
  });

  it("requires a note for “other” and customer.block to block a fake order's phone", async () => {
    const order = await fresh([["M", 1]]);
    expect(
      (await caught(cancelOrder(orderStaff, order.id, { version: 0, reason: "OTHER" }, meta())))
        .code,
    ).toBe("VALIDATION_FAILED");
    const noBlock = await staffFor(RUN, "Order Staff", {
      permissions: ["order.read", "order.cancel"],
      locationIds: [fixture.locationId],
    });
    expect(
      (
        await caught(
          cancelOrder(
            noBlock,
            order.id,
            { version: 0, reason: "FAKE_ORDER", blockPhone: true },
            meta(),
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
    await cancelOrder(
      orderStaff,
      order.id,
      { version: 0, reason: "FAKE_ORDER", blockPhone: true },
      meta(),
    );
    const blocked = await db.blockedPhone.findUniqueOrThrow({
      where: { phone: order.customerPhone },
    });
    expect(blocked.unblockedAt).toBeNull();
  });

  it("lets only one of two simultaneous confirm/cancel calls win", async () => {
    for (let round = 0; round < 3; round += 1) {
      const order = await fresh([["L", 1]]);
      const results = await Promise.allSettled([
        confirmOrder(orderStaff, order.id, { version: order.version }, meta()),
        cancelOrder(
          manager,
          order.id,
          { version: order.version, reason: "CUSTOMER_DECLINED" },
          meta(),
        ),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const reserved = await db.inventoryMovement.aggregate({
        where: { referenceId: order.id },
        _sum: { quantity: true },
      });
      // Confirmed keeps the hold (+1 RESERVE); cancelled has RESERVE +1 and RELEASE -1.
      expect(reserved._sum.quantity).toBe(saved.status === "CONFIRMED" ? 1 : 0);
    }
  });

  it("counts spaced unanswered calls and flags the order unreachable without cancelling", async () => {
    const order = await fresh([["M", 1]]);
    const start = Date.now();
    const at = (hours: number) => () => new Date(start + hours * 3_600_000);
    const first = await logCall(orderStaff, order.id, { outcome: "NO_ANSWER" }, meta(), at(0));
    const quick = await logCall(orderStaff, order.id, { outcome: "NO_ANSWER" }, meta(), at(0.5));
    const second = await logCall(orderStaff, order.id, { outcome: "SWITCHED_OFF" }, meta(), at(2));
    expect([first.counted, quick.counted, second.counted]).toEqual([true, false, true]);
    expect(second.unreachable).toBe(false);
    const third = await logCall(orderStaff, order.id, { outcome: "NO_ANSWER" }, meta(), at(4.5));
    expect(third.unreachable).toBe(true);
    let saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.unreachableAt).not.toBeNull();
    expect(saved.status).toBe("PENDING");
    const answered = await logCall(orderStaff, order.id, { outcome: "CONFIRMED" }, meta(), at(5));
    expect(answered.confirmed).toBe(true);
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.unreachableAt).toBeNull();
    expect(saved.confirmedByUserId).toBe(orderStaff.userId);
    expect(await db.orderCallLog.count({ where: { orderId: order.id } })).toBe(5);
  });

  it("refuses a form opened on an older version", async () => {
    const order = await fresh([["M", 1]]);
    await logCall(orderStaff, order.id, { outcome: "CALL_BACK_LATER" }, meta());
    await confirmOrder(orderStaff, order.id, { version: order.version }, meta());
    expect(
      (
        await caught(
          cancelOrder(
            orderStaff,
            order.id,
            { version: order.version, reason: "OTHER", note: "x y z" },
            meta(),
          ),
        )
      ).code,
    ).toBe("CONFLICT");
  });
});

describe("editing", () => {
  it("swaps a size: reservation moves, kept lines keep their price, the total is recalculated", async () => {
    const order = await fresh([
      ["M", 2],
      ["PANT", 1],
    ]);
    await db.productVariant.update({
      where: { id: fixture.variants.M! },
      data: { pricePoisha: 155_000 },
    });
    const beforeM = await stockOf(fixture.variants.M!, fixture.locationId);
    const beforeL = await stockOf(fixture.variants.L!, fixture.locationId);
    const result = await editOrder(
      orderStaff,
      order.id,
      {
        version: order.version,
        lines: [
          { variantId: fixture.variants.M!, quantity: 1 },
          { variantId: fixture.variants.L!, quantity: 1 },
          { variantId: fixture.variants.PANT!, quantity: 1 },
        ],
        customerName: "Order Test Customer",
        area: fixture.area,
        street: "House 9, Road 4, Block B",
      },
      meta(),
    );
    await db.productVariant.update({
      where: { id: fixture.variants.M! },
      data: { pricePoisha: 150_000 },
    });
    expect((await stockOf(fixture.variants.M!, fixture.locationId)).reserved).toBe(
      beforeM.reserved - 1,
    );
    expect((await stockOf(fixture.variants.L!, fixture.locationId)).reserved).toBe(
      beforeL.reserved + 1,
    );
    const saved = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, statusHistory: true, payments: true },
    });
    const m = saved.items.find((item) => item.variantId === fixture.variants.M);
    const l = saved.items.find((item) => item.variantId === fixture.variants.L);
    expect(m?.unitPricePoisha).toBe(150_000);
    expect(l?.unitPricePoisha).toBe(160_000);
    expect(saved.subtotalPoisha).toBe(150_000 + 160_000 + 200_000);
    expect(saved.totalPoisha).toBe(
      saved.subtotalPoisha - saved.discountPoisha + saved.shippingPoisha,
    );
    expect(result.remindCustomer).toBe(saved.totalPoisha !== order.totalPoisha);
    expect(saved.payments[0]?.amountPoisha).toBe(saved.totalPoisha);
    expect(saved.statusHistory.some((row) => row.event === "EDITED")).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "order.edited", entityId: order.id },
    });
    expect(audit.before).toMatchObject({ totalPoisha: order.totalPoisha });
  });

  it("drops a coupon whose minimum is no longer met and gives its use back", async () => {
    const order = await fresh(
      [
        ["M", 1],
        ["PANT", 1],
      ],
      `ORD${RUN}`,
    );
    expect(order.discountPoisha).toBe(35_000);
    const used = (await db.coupon.findUniqueOrThrow({ where: { code: `ORD${RUN}` } })).usedCount;
    const result = await editOrder(
      orderStaff,
      order.id,
      {
        version: order.version,
        lines: [{ variantId: fixture.variants.M!, quantity: 1 }],
        customerName: "Order Test Customer",
        area: fixture.area,
        street: "House 9, Road 4, Block B",
      },
      meta(),
    );
    expect(result.couponRemoved).toBe(true);
    const saved = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { redemption: true, items: true },
    });
    expect(saved.couponCode).toBeNull();
    expect(saved.discountPoisha).toBe(0);
    expect(saved.redemption).toBeNull();
    expect(saved.items.every((item) => item.discountPoisha === 0)).toBe(true);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: `ORD${RUN}` } })).usedCount).toBe(
      used - 1,
    );
  });

  it("rolls everything back when the new lines are short of stock", async () => {
    const order = await fresh([["M", 1]]);
    const before = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    const beforeM = await stockOf(fixture.variants.M!, fixture.locationId);
    const error = await caught(
      editOrder(
        orderStaff,
        order.id,
        {
          version: order.version,
          lines: [
            { variantId: fixture.variants.M!, quantity: 2 },
            { variantId: fixture.variants.FEW!, quantity: 5 },
          ],
          customerName: "Order Test Customer",
          area: fixture.area,
          street: "House 9, Road 4, Block B",
        },
        meta(),
      ),
    );
    expect(error.code).toBe("OUT_OF_STOCK");
    const after = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(after.version).toBe(before.version);
    expect(after.totalPoisha).toBe(before.totalPoisha);
    expect(after.items.map((item) => [item.variantId, item.quantity])).toEqual(
      before.items.map((item) => [item.variantId, item.quantity]),
    );
    expect(await stockOf(fixture.variants.M!, fixture.locationId)).toEqual(beforeM);
  });

  it("cannot edit once packing has started", async () => {
    const order = await fresh([["M", 1]]);
    await confirmOrder(orderStaff, order.id, { version: 0 }, meta());
    await startPacking(orderStaff, order.id, { version: 1 }, meta());
    expect(
      (
        await caught(
          editOrder(
            orderStaff,
            order.id,
            {
              version: 2,
              lines: [{ variantId: fixture.variants.M!, quantity: 2 }],
              customerName: "Order Test Customer",
              area: fixture.area,
              street: "House 9, Road 4, Block B",
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("CONFLICT");
    await unpackOrder(orderStaff, order.id, { version: 2 }, meta());
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "CONFIRMED",
    );
  });
});

describe("fulfilment location", () => {
  it("moves the reservation to another location, or changes nothing when it is short", async () => {
    const order = await fresh([["M", 1]]);
    // Nothing at the second warehouse yet: refused, nothing moved.
    const before = await stockOf(fixture.variants.M!, fixture.locationId);
    expect(
      (
        await caught(
          changeFulfilmentLocation(
            orderStaff,
            order.id,
            { version: order.version, locationId: secondLocationId },
            meta(),
          ),
        )
      ).code,
    ).toBe("OUT_OF_STOCK");
    expect(await stockOf(fixture.variants.M!, fixture.locationId)).toEqual(before);

    await db.$transaction(async () => {});
    const { runInventoryTransaction } = await import("@/modules/inventory/inventory.repository");
    const { applyStockMovements } = await import("@/modules/inventory/inventory.service");
    await runInventoryTransaction((uow) =>
      applyStockMovements(uow, [
        {
          variantId: fixture.variants.M!,
          locationId: secondLocationId,
          type: "OPENING",
          quantity: 3,
          userId: null,
        },
      ]),
    );
    await changeFulfilmentLocation(
      orderStaff,
      order.id,
      { version: order.version, locationId: secondLocationId },
      meta(),
    );
    expect((await stockOf(fixture.variants.M!, fixture.locationId)).reserved).toBe(
      before.reserved - 1,
    );
    expect((await stockOf(fixture.variants.M!, secondLocationId)).reserved).toBe(1);
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.locationId).toBe(secondLocationId);
    // Staff of the second warehouse now see it; those without access get 403.
    expect((await getOrderForStaff(otherBranch, order.id)).order.id).toBe(order.id);
  });
});

describe("shipping and delivery", () => {
  it("takes the stock off the shelf and issues the invoice when it ships", async () => {
    const order = await fresh([
      ["M", 2],
      ["PANT", 1],
    ]);
    await confirmOrder(orderStaff, order.id, { version: 0 }, meta());
    await startPacking(orderStaff, order.id, { version: 1 }, meta());
    expect(
      (
        await caught(
          shipOrder(orderStaff, order.id, { courier: "STEADFAST", trackingCode: "SF123" }, meta()),
        )
      ).message,
    ).toMatch(/packing/i);
    // A wrong count is refused.
    expect(
      (
        await caught(
          markPacked(
            orderStaff,
            order.id,
            {
              version: 2,
              counted: [
                { variantId: fixture.variants.M!, quantity: 1 },
                { variantId: fixture.variants.PANT!, quantity: 1 },
              ],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("CONFLICT");
    expect(
      (
        await caught(
          markPacked(
            orderStaff,
            order.id,
            {
              version: 2,
              counted: [
                { variantId: fixture.variants.M!, quantity: 2 },
                { variantId: fixture.variants.PANT!, quantity: 1 },
                { variantId: fixture.variants.L!, quantity: 1 },
              ],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("CONFLICT");
    await markPacked(
      orderStaff,
      order.id,
      {
        version: 2,
        counted: [
          { variantId: fixture.variants.M!, quantity: 2 },
          { variantId: fixture.variants.PANT!, quantity: 1 },
        ],
      },
      meta(),
    );
    const before = await stockOf(fixture.variants.M!, fixture.locationId);
    const shipped = await shipOrder(
      orderStaff,
      order.id,
      { courier: "STEADFAST", trackingCode: "SF-123456" },
      meta(),
    );
    const after = await stockOf(fixture.variants.M!, fixture.locationId);
    expect(after.onHand).toBe(before.onHand - 2);
    expect(after.reserved).toBe(before.reserved - 2);
    expect(shipped.invoiceNumber).toMatch(/^INV-\d{4}-\d{5,}$/);
    const saved = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { shipments: true, invoices: true },
    });
    expect(saved.status).toBe("SHIPPED");
    expect(saved.shipments[0]).toMatchObject({
      courier: "STEADFAST",
      mode: "MANUAL",
      status: "IN_TRANSIT",
      trackingCode: "SF-123456",
      codAmountPoisha: saved.totalPoisha,
    });
    expect(saved.invoices).toHaveLength(1);
    expect(saved.invoices[0]?.snapshot).toMatchObject({
      number: shipped.invoiceNumber,
      totals: { totalPoisha: saved.totalPoisha },
    });
    const sales = await db.inventoryMovement.findMany({
      where: { referenceId: order.id, type: "SALE_ONLINE" },
    });
    expect(sales.reduce((sum, row) => sum + row.quantity, 0)).toBe(-3);

    // An address fix after shipping keeps the number and adds a version.
    await correctAddress(
      orderStaff,
      order.id,
      {
        version: saved.version,
        customerName: "Order Test Customer",
        area: fixture.area,
        street: "House 10, Road 4, Block B",
        reason: "Wrong house number",
      },
      meta(),
    );
    const invoices = await db.invoice.findMany({
      where: { orderId: order.id },
      orderBy: { version: "asc" },
    });
    expect(invoices.map((row) => [row.number, row.version, row.isCurrent])).toEqual([
      [shipped.invoiceNumber, 1, false],
      [shipped.invoiceNumber, 2, true],
    ]);

    await markDelivered(orderStaff, order.id, { version: saved.version + 1 }, meta());
    const delivered = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.paymentStatus).toBe("UNPAID");
  });

  it("ships many orders, each on its own, and explains the ones that fail", async () => {
    const ready = await fresh([["M", 1]]);
    await toPacked(ready.id);
    const notPacked = await fresh([["M", 1]]);
    const results = await shipOrders(
      orderStaff,
      {
        courier: "PATHAO",
        orders: [
          { orderId: ready.id, trackingCode: "PT-1" },
          { orderId: notPacked.id, trackingCode: "PT-2" },
        ],
      },
      meta(),
    );
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false });
    expect((await db.order.findUniqueOrThrow({ where: { id: ready.id } })).status).toBe("SHIPPED");
    expect((await db.order.findUniqueOrThrow({ where: { id: notPacked.id } })).status).toBe(
      "PENDING",
    );
  });

  it("brings a failed delivery back: good units restocked, damaged written off, charge recorded", async () => {
    const order = await fresh([
      ["L", 2],
      ["PANT", 1],
    ]);
    await toPacked(order.id);
    await shipOrder(orderStaff, order.id, { courier: "REDX", trackingCode: "RX-9" }, meta());
    let saved = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    await markDeliveryFailed(
      orderStaff,
      order.id,
      { version: saved.version, reason: "Customer refused" },
      meta(),
    );
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(saved.status).toBe("DELIVERY_FAILED");
    const beforeL = await stockOf(fixture.variants.L!, fixture.locationId);
    const beforePant = await stockOf(fixture.variants.PANT!, fixture.locationId);
    const lineL = saved.items.find((item) => item.variantId === fixture.variants.L)!;
    const linePant = saved.items.find((item) => item.variantId === fixture.variants.PANT)!;
    expect(
      (
        await caught(
          receiveReturnedParcel(
            orderStaff,
            order.id,
            {
              version: saved.version,
              locationId: fixture.locationId,
              lines: [{ orderItemId: lineL.id, good: 1, damaged: 0 }],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    await receiveReturnedParcel(
      orderStaff,
      order.id,
      {
        version: saved.version,
        locationId: fixture.locationId,
        lines: [
          { orderItemId: lineL.id, good: 1, damaged: 1 },
          { orderItemId: linePant.id, good: 1, damaged: 0 },
        ],
        lostCharge: "70",
      },
      meta(),
    );
    expect((await stockOf(fixture.variants.L!, fixture.locationId)).onHand).toBe(
      beforeL.onHand + 1,
    );
    expect((await stockOf(fixture.variants.PANT!, fixture.locationId)).onHand).toBe(
      beforePant.onHand + 1,
    );
    const movements = await db.inventoryMovement.findMany({
      where: {
        referenceId: order.id,
        variantId: fixture.variants.L!,
        type: { in: ["RETURN", "DAMAGE"] },
      },
    });
    expect(movements.map((row) => [row.type, row.quantity]).sort()).toEqual([
      ["DAMAGE", -1],
      ["RETURN", 2],
    ]);
    const final = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { shipments: true },
    });
    expect(final.status).toBe("RETURNED_TO_WAREHOUSE");
    expect(final.shipments[0]).toMatchObject({ status: "RETURNED", lostChargePoisha: 7_000 });
    const customer = await getCustomerView(orderStaff, order.id);
    expect(customer.totals.deliveryFailed).toBeGreaterThanOrEqual(1);
  });

  it("can send a failed parcel out again without touching stock", async () => {
    const order = await fresh([["M", 1]]);
    await toPacked(order.id);
    await shipOrder(orderStaff, order.id, { courier: "MANUAL" }, meta());
    let saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await markDeliveryFailed(
      orderStaff,
      order.id,
      { version: saved.version, reason: "Not home" },
      meta(),
    );
    const before = await stockOf(fixture.variants.M!, fixture.locationId);
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await shipOrder(orderStaff, order.id, { version: saved.version, courier: "MANUAL" }, meta());
    expect(await stockOf(fixture.variants.M!, fixture.locationId)).toEqual(before);
    expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe("courier cash", () => {
  it("marks delivered orders paid, keeps short ones unpaid and never settles an order twice", async () => {
    const make = async () => {
      const order = await fresh([["PANT", 1]]);
      await toPacked(order.id);
      await shipOrder(
        orderStaff,
        order.id,
        { courier: "STEADFAST", trackingCode: `SF-${order.id.slice(-6)}` },
        meta(),
      );
      const shipped = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      await markDelivered(orderStaff, order.id, { version: shipped.version }, meta());
      return db.order.findUniqueOrThrow({ where: { id: order.id } });
    };
    const full = await make();
    const short = await make();
    expect(
      (await caught(recordCodSettlement(orderStaff, { courier: "STEADFAST" }, meta()))).code,
    ).toBe("FORBIDDEN");
    const workspace = await getCodWorkspace(manager);
    expect(workspace.unsettled.map((row) => row.id)).toEqual(
      expect.arrayContaining([full.id, short.id]),
    );
    const totalTaka = (full.totalPoisha + short.totalPoisha) / 100;
    const result = await recordCodSettlement(
      manager,
      {
        courier: "STEADFAST",
        receivedOn: "2026-11-16",
        received: String(totalTaka - 100 - 50),
        courierCharge: "100",
        orders: [
          { orderId: full.id },
          { orderId: short.id, received: String(short.totalPoisha / 100 - 50) },
        ],
      },
      meta(),
    );
    expect(result.paidOrders).toBe(1);
    expect(result.shortOrders).toBe(1);
    expect(result.differencePoisha).toBe(-5_000);
    const paid = await db.order.findUniqueOrThrow({
      where: { id: full.id },
      include: { payments: true },
    });
    expect(paid.paymentStatus).toBe("PAID");
    expect(paid.paidPoisha).toBe(full.totalPoisha);
    expect(paid.payments[0]?.status).toBe("PAID");
    const unpaid = await db.order.findUniqueOrThrow({ where: { id: short.id } });
    expect(unpaid.paymentStatus).toBe("UNPAID");
    expect(unpaid.paidPoisha).toBe(short.totalPoisha - 5_000);
    expect(
      (
        await caught(
          recordCodSettlement(
            manager,
            {
              courier: "STEADFAST",
              receivedOn: "2026-11-16",
              received: "1",
              orders: [{ orderId: short.id }],
            },
            meta(),
          ),
        )
      ).message,
    ).toMatch(/already in a courier settlement/);
  });
});

describe("location access", () => {
  it("refuses staff of another location (403) on reads and changes", async () => {
    const order = await fresh([["M", 1]]);
    expect((await caught(getOrderForStaff(otherBranch, order.id))).code).toBe("LOCATION_FORBIDDEN");
    expect((await caught(confirmOrder(otherBranch, order.id, { version: 0 }, meta()))).code).toBe(
      "LOCATION_FORBIDDEN",
    );
    const list = await listOrdersForStaff(otherBranch, { tab: "all" });
    expect(list.rows.some((row) => row.id === order.id)).toBe(false);
  });

  it("masks the phone without customer.read", async () => {
    const order = await fresh([["M", 1]]);
    const viewer = await staffFor(RUN, "Order Staff", {
      permissions: ["order.read"],
      locationIds: [fixture.locationId],
    });
    const masked = await getOrderForStaff(viewer, order.id);
    expect(masked.order.customerPhone).toMatch(/^01\*\*\*-\*\*\*\d{3}$/);
    expect(masked.phoneMasked).toBe(true);
    const list = await listOrdersForStaff(viewer, { tab: "all" });
    expect(list.rows.every((row) => !row.customerPhone.startsWith("+880"))).toBe(true);
    expect(
      (await caught(listOrdersForStaff(await staffFor(RUN, "Inventory Staff"), {}))).code,
    ).toBe("FORBIDDEN");
  });
});

describe("ledger", () => {
  it("still matches every stock row", async () => {
    expect((await findLedgerMismatches(db)).mismatches).toEqual([]);
  });
});
