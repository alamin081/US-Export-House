import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { applyStockMovements } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import {
  markDeliveryFailed,
  markPacked,
  receiveReturnedParcel,
  shipOrder,
  startPacking,
} from "@/modules/orders/fulfilment.service";
import { confirmOrder, listOrdersForStaff } from "@/modules/orders/orders.service";
import { closeDay, openDay, sell } from "@/modules/pos/pos.service";
import { getDashboard } from "@/modules/reports/dashboard.service";
import {
  exportReportTable,
  getReport,
  salesTotalsFor,
  tableCsvColumns,
  type ReportResult,
} from "@/modules/reports/reports.service";
import { toCsv } from "@/modules/reports/report-csv";
import { recordRefund } from "@/modules/returns/refund.service";
import {
  approveReturn,
  createStaffReturn,
  inspectReturn,
  receiveReturn,
} from "@/modules/returns/returns.service";
import {
  caught,
  createFixture,
  placeTestOrder,
  runId,
  staffFor,
  testMeta,
  type Fixture,
} from "./order-fixture";

/**
 * Phase 12 B-1 against the real test database: sales figures agree across the
 * dashboard, the sales report and the Z-report; refunds come off net sales;
 * a branch manager sees only their branch; purchase cost and profit never
 * appear for staff without inventory.cost.read; the cost snapshot is frozen
 * at the moment of sale.
 */

const RUN = runId();
const meta = testMeta;
const key = () => `${RUN}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const COST_A = 61_234;
let branchA = "";
let branchB = "";
const variants: Record<string, string> = {};
let managerA: StaffContext;
let managerB: StaffContext;
let sellerA: StaffContext;
let sellerB: StaffContext;
let owner: StaffContext;
let dayA = "";
let dayB = "";
let online: Fixture;
let orderStaff: StaffContext;

const today = { range: "today" };

function totalOf(result: ReportResult, tableId: string) {
  return result.tables.find((table) => table.id === tableId)!.totals!;
}

beforeAll(async () => {
  branchA = (
    await db.location.create({
      data: { code: `RA${RUN.slice(-6)}`, type: "BRANCH", nameEn: `Report A ${RUN}` },
    })
  ).id;
  branchB = (
    await db.location.create({
      data: { code: `RB${RUN.slice(-6)}`, type: "BRANCH", nameEn: `Report B ${RUN}` },
    })
  ).id;
  const category = await db.category.create({
    data: { slug: `it-rep-${RUN.toLowerCase()}`, nameEn: `Reports ${RUN}` },
  });
  const product = await db.product.create({
    data: {
      slug: `it-rep-${RUN.toLowerCase()}`,
      nameEn: `Report Shirt ${RUN}`,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: [
          { sku: `RP-${RUN}-A`, pricePoisha: 150_000, costPoisha: COST_A, labelEn: "A" },
          { sku: `RP-${RUN}-B`, pricePoisha: 90_000, labelEn: "B" },
        ],
      },
    },
    select: { variants: { select: { id: true, sku: true } } },
  });
  for (const row of product.variants) variants[row.sku.split("-").pop()!] = row.id;
  await runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      [branchA, branchB].flatMap((locationId) =>
        ["A", "B"].map((name) => ({
          variantId: variants[name]!,
          locationId,
          type: "OPENING" as const,
          quantity: 20,
          userId: null,
        })),
      ),
    ),
  );
  managerA = await staffFor(RUN, "Branch Manager", { locationIds: [branchA] });
  managerB = await staffFor(RUN, "Branch Manager", { locationIds: [branchB] });
  sellerA = await staffFor(RUN, "Branch Sales Staff", { locationIds: [branchA] });
  sellerB = await staffFor(RUN, "Branch Sales Staff", { locationIds: [branchB] });
  owner = await staffFor(RUN, "Super Admin");
  dayA = (await openDay(managerA, { locationId: branchA, openingFloat: "1000" }, meta())).id;
  dayB = (await openDay(managerB, { locationId: branchB }, meta())).id;

  online = await createFixture(RUN, { M: [120_000, 10] });
  orderStaff = await staffFor(RUN, "Order Staff", { locationIds: [online.locationId] });
});

afterAll(async () => {
  await db.$disconnect();
});

async function tillSale(
  staff: StaffContext,
  sessionId: string,
  lines: Array<[string, number]>,
  payments: unknown[],
  extra: object = {},
) {
  return sell(
    staff,
    {
      sessionId,
      idempotencyKey: key(),
      lines: lines.map(([name, quantity]) => ({ variantId: variants[name]!, quantity })),
      payments,
      ...extra,
    },
    meta(),
  );
}

describe("cost snapshot", () => {
  it("freezes the weighted average cost on the sold line and the sale movement", async () => {
    const result = await tillSale(sellerA, dayA, [["A", 1]], [{ method: "CASH", amount: "1500" }]);
    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { items: true },
    });
    expect(order.soldAt).not.toBeNull();
    expect(order.items[0]!.unitCostPoisha).toBe(COST_A);
    const movement = await db.inventoryMovement.findFirstOrThrow({
      where: { referenceId: order.id, type: "SALE_STORE" },
    });
    expect(movement.unitCostPoisha).toBe(COST_A);

    // A later cost change does not rewrite what was sold.
    await db.productVariant.update({ where: { id: variants.A! }, data: { costPoisha: 99_999 } });
    expect(
      (await db.orderItem.findUniqueOrThrow({ where: { id: order.items[0]!.id } })).unitCostPoisha,
    ).toBe(COST_A);
    await db.productVariant.update({ where: { id: variants.A! }, data: { costPoisha: COST_A } });

    // A variant without a cost stays unknown — never guessed.
    const noCost = await tillSale(sellerA, dayA, [["B", 1]], [{ method: "CASH", amount: "900" }]);
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: noCost.orderId } });
    expect(item.unitCostPoisha).toBeNull();
  });

  it("sets soldAt and the cost when an online order is first shipped, not before", async () => {
    await db.productVariant.update({
      where: { id: online.variants.M! },
      data: { costPoisha: 70_000 },
    });
    const order = await placeTestOrder(online, [["M", 2]]);
    const version = async () =>
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).version;
    await confirmOrder(orderStaff, order.id, { version: await version() }, meta());
    await startPacking(orderStaff, order.id, { version: await version() }, meta());
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).soldAt).toBeNull();
    await markPacked(
      orderStaff,
      order.id,
      {
        version: await version(),
        counted: [{ variantId: online.variants.M!, quantity: 2 }],
      },
      meta(),
    );
    await shipOrder(orderStaff, order.id, { courier: "REDX", trackingCode: "RX-REP" }, meta());
    const shipped = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, invoices: true },
    });
    expect(shipped.soldAt).not.toBeNull();
    expect(shipped.soldAt!.getTime()).toBe(shipped.invoices[0]!.issuedAt.getTime());
    expect(shipped.items[0]!.unitCostPoisha).toBe(70_000);

    // A failed delivery and a second attempt keep the first sale moment.
    await markDeliveryFailed(
      orderStaff,
      order.id,
      { version: shipped.version, reason: "Not at home" },
      meta(),
    );
    const failed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await shipOrder(
      orderStaff,
      order.id,
      { version: failed.version, courier: "REDX", trackingCode: "RX-REP2" },
      meta(),
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).soldAt!.getTime()).toBe(
      shipped.soldAt!.getTime(),
    );
  });
});

describe("one set of numbers", () => {
  it("dashboard = sales report = Z-report for a branch, refunds included", async () => {
    // Two more sales and a refund paid from the drawer.
    const bill = await tillSale(
      sellerA,
      dayA,
      [
        ["A", 2],
        ["B", 1],
      ],
      [{ method: "CASH", amount: "3800" }],
      { billDiscount: { kind: "AMOUNT", value: "100" } },
    );
    await tillSale(
      sellerA,
      dayA,
      [["A", 1]],
      [{ method: "CARD", amount: "1500", reference: "CARD-1" }],
    );
    const order = await db.order.findUniqueOrThrow({
      where: { id: bill.orderId },
      include: { items: true },
    });
    const lineA = order.items.find((item) => item.variantId === variants.A)!;
    const request = await createStaffReturn(
      managerA,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "SIZE_MISMATCH",
        items: [{ orderItemId: lineA.id, quantity: 1 }],
      },
      meta(),
    );
    await approveReturn(managerA, request.id, meta());
    await receiveReturn(managerA, request.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: request.id } });
    await inspectReturn(
      managerA,
      request.id,
      { locationId: branchA, items: [{ returnItemId: item.id, result: "ACCEPTED" }] },
      meta(),
    );
    await recordRefund(managerA, request.id, { method: "CASH", posSessionId: dayA }, meta());
    const refund = await db.refund.findFirstOrThrow({ where: { returnRequestId: request.id } });
    expect(refund.status).toBe("COMPLETED");

    const closed = await closeDay(
      managerA,
      dayA,
      { countedCash: "0", reason: "Not counted in this test" },
      meta(),
    );
    const z = closed.report;
    const report = await getReport(managerA, "sales", { ...today, location: branchA });
    const totals = totalOf(report, "periods");
    expect(totals.orders).toBe(z.bills);
    expect(totals.gross).toBe(z.grossPoisha);
    expect(totals.discount).toBe(z.discountPoisha);
    expect(totals.goods).toBe(z.netSalesPoisha);
    expect(totals.refunds).toBe(refund.amountPoisha);
    // Refunds come off the net.
    expect(totals.net).toBe(z.netSalesPoisha - refund.amountPoisha);
    expect(report.notes.join(" ")).toContain(
      `Refunds paid from a till drawer: ৳${(z.refundsPoisha / 100).toFixed(2)}`,
    );

    const direct = await salesTotalsFor(managerA, {
      from: report.filters.range.from,
      to: report.filters.range.to,
    });
    expect(direct.netSalesPoisha).toBe(totals.net);
    const dashboard = await getDashboard(managerA);
    expect(dashboard.sales!.today.netSalesPoisha).toBe(totals.net);
    expect(dashboard.sales!.today.orders).toBe(z.bills);
  });
});

describe("location scope", () => {
  it("a branch manager never sees another branch's figures", async () => {
    await tillSale(sellerB, dayB, [["A", 3]], [{ method: "CASH", amount: "4500" }]);
    const own = totalOf(await getReport(managerB, "sales", { ...today }), "periods");
    expect(own.orders).toBe(1);
    expect(own.gross).toBe(450_000);

    // Asking for branch B explicitly gives nothing; the default scope excludes it.
    const asked = totalOf(
      await getReport(managerA, "sales", { ...today, location: branchB }),
      "periods",
    );
    expect(asked.orders).toBe(0);
    expect(asked.gross).toBe(0);
    const mine = await getReport(managerA, "sales", { ...today });
    const locations = mine.tables.find((table) => table.id === "locations")!;
    expect(locations.rows.map((row) => row.cells.location)).toEqual([
      expect.stringContaining(`RA${RUN.slice(-6)}`),
    ]);
    const stock = await getReport(managerA, "stock-value", { location: branchB });
    expect(stock.tables[0]!.rows).toEqual([]);
    expect((await getDashboard(managerA)).sales!.locations.map((row) => row.id)).toEqual([branchA]);
  });

  it("the owner sees both branches", async () => {
    const both = totalOf(
      await getReport(owner, "sales", { ...today, channel: "STORE" }),
      "periods",
    );
    const a = totalOf(await getReport(owner, "sales", { ...today, location: branchA }), "periods");
    const b = totalOf(await getReport(owner, "sales", { ...today, location: branchB }), "periods");
    expect(Number(both.gross)).toBeGreaterThanOrEqual(Number(a.gross) + Number(b.gross));
  });
});

describe("purchase cost", () => {
  it("never reaches staff without inventory.cost.read", async () => {
    expect((await caught(getReport(managerA, "profit", today))).code).toBe("FORBIDDEN");
    const costText = String(COST_A);
    for (const key of ["stock-value", "slow-stock", "movements", "products", "sales"] as const) {
      const result = await getReport(managerA, key, { ...today, location: branchA, days: "7" });
      for (const table of result.tables) {
        for (const column of table.columns) expect(column.key).not.toMatch(/cost|profit|margin/i);
        for (const row of table.rows) {
          expect(Object.keys(row.cells).join(",")).not.toMatch(/cost|profit/i);
        }
      }
      expect(result.kpis.map((kpi) => kpi.label).join(",")).not.toMatch(/cost|profit|margin/i);
      // The cost figure itself (and its multiples) is nowhere in the payload.
      const payload = JSON.stringify(result);
      expect(payload).not.toContain(costText);
    }
    const dashboard = await getDashboard(managerA);
    expect(dashboard.profit).toBeNull();
    expect(JSON.stringify(dashboard)).not.toContain(costText);

    const exported = await exportReportTable(
      managerA,
      "stock-value",
      { location: branchA },
      null,
      meta(),
    );
    const csv = toCsv(tableCsvColumns(exported.table), exported.rows);
    expect(csv.split("\r\n")[0]).not.toMatch(/cost/i);
  });

  it("shows cost and profit to the owner, with unknown cost kept apart", async () => {
    const profit = await getReport(owner, "profit", { ...today, location: branchA });
    const totals = totalOf(profit, "products");
    // Sold at branch A today: A×4 known cost (one came back to stock), B×2 unknown.
    expect(totals.cost).toBe(COST_A * 4 - COST_A);
    expect(Number(totals.unknown)).toBeGreaterThan(0);
    const stock = await getReport(owner, "stock-value", { location: branchA });
    expect(stock.tables[0]!.columns.map((column) => column.key)).toContain("cost");
  });

  it("refuses CSV export without report.export and audits exports", async () => {
    const seller = await staffFor(RUN, "Branch Sales Staff", {
      locationIds: [branchA],
      permissions: ["report.view", "order.read"],
    });
    expect((await caught(exportReportTable(seller, "sales", today, null, meta()))).code).toBe(
      "FORBIDDEN",
    );
    await exportReportTable(managerA, "sales", { ...today, location: branchA }, "periods", meta());
    const audit = await db.auditLog.findFirst({
      where: { action: "report.exported", userId: managerA.userId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.entityId).toBe("sales:periods");
  });
});

describe("drill-down", () => {
  it("lists the online orders sold in a period", async () => {
    const report = await getReport(owner, "sales", today);
    const { fromKey, toKey } = report.filters.range;
    const list = await listOrdersForStaff(owner, { tab: "all", soldFrom: fromKey, soldTo: toKey });
    expect(list.rows.length).toBeGreaterThan(0);
    for (const row of list.rows) expect(row.status).not.toBe("CANCELLED");
  });
});

describe("delivery returns", () => {
  it("take a returned parcel's goods off net sales", async () => {
    const order = await placeTestOrder(online, [["M", 1]]);
    const version = async () =>
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).version;
    await confirmOrder(orderStaff, order.id, { version: await version() }, meta());
    await startPacking(orderStaff, order.id, { version: await version() }, meta());
    await markPacked(
      orderStaff,
      order.id,
      { version: await version(), counted: [{ variantId: online.variants.M!, quantity: 1 }] },
      meta(),
    );
    await shipOrder(orderStaff, order.id, { courier: "REDX", trackingCode: "RX-RTW" }, meta());
    const before = totalOf(
      await getReport(owner, "sales", { ...today, location: online.locationId }),
      "periods",
    );
    await markDeliveryFailed(
      orderStaff,
      order.id,
      { version: await version(), reason: "Refused" },
      meta(),
    );
    const line = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await receiveReturnedParcel(
      orderStaff,
      order.id,
      {
        version: await version(),
        locationId: online.locationId,
        lines: [{ orderItemId: line.id, good: 1, damaged: 0 }],
      },
      meta(),
    );
    const after = totalOf(
      await getReport(owner, "sales", { ...today, location: online.locationId }),
      "periods",
    );
    const goods = order.subtotalPoisha - order.discountPoisha;
    expect(after.deliveryReturns).toBe(Number(before.deliveryReturns) + goods);
    expect(after.net).toBe(Number(before.net) - goods);
    expect(after.delivery).toBe(Number(before.delivery) - order.shippingPoisha);
  });
});

describe("ledger", () => {
  it("still matches every stock row", async () => {
    expect((await findLedgerMismatches(db)).mismatches).toEqual([]);
  });
});
