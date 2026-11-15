import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { hashPassword } from "@/modules/access/password";
import { applyStockMovements } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import { isValidEan13 } from "@/modules/labels/barcode";
import { generateMissingBarcodes } from "@/modules/labels/labels.service";
import {
  closeDay,
  getDay,
  holdBill,
  getHeldBills,
  openDay,
  resumeHeldBill,
  sell,
  setOwnPin,
} from "@/modules/pos/pos.service";
import { recordRefund } from "@/modules/returns/refund.service";
import {
  approveReturn,
  createStaffReturn,
  inspectReturn,
  receiveReturn,
} from "@/modules/returns/returns.service";
import { caught, runId, staffFor, stockOf, testMeta } from "./order-fixture";

/**
 * Phase 9 step B-3 against the real test database: till days, sales
 * (stock straight off the shelf, invoice = bill), discount limits and the
 * manager PIN, the last piece at two counters, held bills, cash refunds in
 * the drawer, closing the day (and the database refusing changes to it), and
 * barcode generation.
 */

const RUN = runId();
const meta = testMeta;
const key = () => `${RUN}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
let branchId = "";
let branchCode = "";
let otherBranchId = "";
const variants: Record<string, string> = {};
let seller: StaffContext;
let manager: StaffContext;
let outsider: StaffContext;
let managerEmail = "";
let mainDay = "";
let secondDay = "";
let countersBefore: string | null = null;

function sale(
  sessionId: string,
  lines: Array<[string, number]>,
  payments: unknown[],
  extra: object = {},
) {
  return {
    sessionId,
    idempotencyKey: key(),
    lines: lines.map(([name, quantity]) => ({ variantId: variants[name]!, quantity })),
    payments,
    ...extra,
  };
}

beforeAll(async () => {
  branchCode = `PS${RUN.slice(-6)}`;
  const branch = await db.location.create({
    data: { code: branchCode, type: "BRANCH", nameEn: `Till branch ${RUN}` },
  });
  branchId = branch.id;
  otherBranchId = (
    await db.location.create({
      data: { code: `PO${RUN.slice(-6)}`, type: "BRANCH", nameEn: `Other ${RUN}` },
    })
  ).id;
  const category = await db.category.create({
    data: { slug: `it-pos-${RUN.toLowerCase()}`, nameEn: `Till ${RUN}` },
  });
  const product = await db.product.create({
    data: {
      slug: `it-pos-${RUN.toLowerCase()}`,
      nameEn: `Till Shirt ${RUN}`,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: [
          { sku: `PS-${RUN}-A`, pricePoisha: 100_000, labelEn: "A" },
          { sku: `PS-${RUN}-B`, pricePoisha: 250_000, labelEn: "B" },
          { sku: `PS-${RUN}-LAST`, pricePoisha: 80_000, labelEn: "LAST" },
        ],
      },
    },
    select: { variants: { select: { id: true, sku: true } } },
  });
  for (const row of product.variants) variants[row.sku.split("-").pop()!] = row.id;
  await runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      [
        ["A", 50],
        ["B", 20],
        ["LAST", 1],
      ].map(([name, quantity]) => ({
        variantId: variants[name as string]!,
        locationId: branchId,
        type: "OPENING" as const,
        quantity: quantity as number,
        userId: null,
      })),
    ),
  );
  seller = await staffFor(RUN, "Branch Sales Staff", { locationIds: [branchId] });
  manager = await staffFor(RUN, "Branch Manager", { locationIds: [branchId] });
  outsider = await staffFor(RUN, "Branch Manager", { locationIds: [otherBranchId] });
  managerEmail = manager.email;
  await db.staffLocationAccess.create({ data: { userId: manager.userId, locationId: branchId } });
  await db.user.update({
    where: { id: manager.userId },
    data: { passwordHash: await hashPassword("Correct horse 42!") },
  });
  await db.coupon.create({
    data: { code: `TILL${RUN}`, type: "FIXED", value: 10_000, channel: "STORE" },
  });
  await db.coupon.create({
    data: { code: `WEB${RUN}`, type: "FIXED", value: 10_000, channel: "ONLINE" },
  });
  countersBefore = (await db.setting.findUnique({ where: { key: "pos.counters" } }))?.value ?? null;
  await db.setting.upsert({
    where: { key: "pos.counters" },
    create: {
      key: "pos.counters",
      value: JSON.stringify({ [branchCode]: ["2"] }),
      valueType: "JSON",
      group: "pos",
    },
    update: {
      value: JSON.stringify({ ...JSON.parse(countersBefore ?? "{}"), [branchCode]: ["2"] }),
    },
  });
});

afterAll(async () => {
  if (countersBefore === null) await db.setting.deleteMany({ where: { key: "pos.counters" } });
  else await db.setting.update({ where: { key: "pos.counters" }, data: { value: countersBefore } });
  await db.$disconnect();
});

describe("till days", () => {
  it("opens one day per counter and refuses another branch", async () => {
    expect((await caught(openDay(seller, { locationId: branchId }, meta()))).code).toBe(
      "FORBIDDEN",
    );
    expect((await caught(openDay(outsider, { locationId: branchId }, meta()))).code).toBe(
      "LOCATION_FORBIDDEN",
    );
    mainDay = (await openDay(manager, { locationId: branchId, openingFloat: "2000" }, meta())).id;
    expect((await caught(openDay(manager, { locationId: branchId }, meta()))).code).toBe(
      "CONFLICT",
    );
    secondDay = (await openDay(manager, { locationId: branchId, counterCode: "2" }, meta())).id;
    expect(
      (await caught(openDay(manager, { locationId: branchId, counterCode: "9" }, meta()))).code,
    ).toBe("VALIDATION_FAILED");
  });
});

describe("selling", () => {
  it("sells straight off the shelf, splits the payment, gives change and issues the bill", async () => {
    const before = await stockOf(variants.A!, branchId);
    const result = await sell(
      seller,
      sale(
        mainDay,
        [
          ["A", 2],
          ["B", 1],
        ],
        [
          { method: "CASH", amount: "2500", tendered: "3000" },
          { method: "CARD", amount: "2000", reference: "AUTH-1" },
        ],
      ),
      meta(),
    );
    expect(result).toMatchObject({ totalPoisha: 450_000, changePoisha: 50_000, reused: false });
    expect(result.billNumber).toMatch(/^INV-\d{4}-\d{5,}$/);
    expect((await stockOf(variants.A!, branchId)).onHand).toBe(before.onHand - 2);
    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { payments: true, invoices: true },
    });
    expect(order).toMatchObject({
      channel: "STORE",
      status: "DELIVERED",
      paymentStatus: "PAID",
      paidPoisha: 450_000,
      posSessionId: mainDay,
      soldByUserId: seller.userId,
    });
    expect(order.payments.find((payment) => payment.provider === "CASH")).toMatchObject({
      amountPoisha: 250_000,
      tenderedPoisha: 300_000,
      changePoisha: 50_000,
    });
    const movements = await db.inventoryMovement.findMany({ where: { referenceId: order.id } });
    expect(movements.every((row) => row.type === "SALE_STORE")).toBe(true);
  });

  it("does not charge twice for the same bill", async () => {
    const input = sale(mainDay, [["A", 1]], [{ method: "CASH", amount: "1000" }]);
    const first = await sell(seller, input, meta());
    const again = await sell(seller, input, meta());
    expect(again).toMatchObject({ orderId: first.orderId, reused: true });
    expect(await db.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
  });

  it("refuses wrong payments", async () => {
    expect(
      (
        await caught(
          sell(seller, sale(mainDay, [["A", 1]], [{ method: "CASH", amount: "900" }]), meta()),
        )
      ).message,
    ).toMatch(/do not add up/);
    expect(
      (
        await caught(
          sell(seller, sale(mainDay, [["A", 1]], [{ method: "BKASH", amount: "1000" }]), meta()),
        )
      ).message,
    ).toMatch(/reference/);
  });

  it("applies a STORE coupon and refuses an online-only one", async () => {
    const ok = await sell(
      seller,
      sale(mainDay, [["A", 1]], [{ method: "CASH", amount: "900" }], { couponCode: `TILL${RUN}` }),
      meta(),
    );
    expect(ok.totalPoisha).toBe(90_000);
    expect(
      (
        await caught(
          sell(
            seller,
            sale(mainDay, [["A", 1]], [{ method: "CASH", amount: "900" }], {
              couponCode: `WEB${RUN}`,
            }),
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
  });

  it("needs a manager's PIN above the seller's 5% limit", async () => {
    const discounted = (extra: object) =>
      sale(mainDay, [["B", 1]], [{ method: "CASH", amount: "2250" }], {
        billDiscount: { kind: "PERCENT", value: "10" },
        ...extra,
      });
    const refused = await caught(sell(seller, discounted({}), meta()));
    expect(refused.code).toBe("FORBIDDEN");
    expect(refused.message).toMatch(/5% limit/);
    await setOwnPin(manager, { password: "Correct horse 42!", pin: "4321" }, meta());
    expect(
      (
        await caught(
          sell(seller, discounted({ approval: { email: managerEmail, pin: "0000" } }), meta()),
        )
      ).message,
    ).toMatch(/PIN is not accepted/);
    const approved = await sell(
      seller,
      discounted({ approval: { email: managerEmail, pin: "4321" } }),
      meta(),
    );
    const order = await db.order.findUniqueOrThrow({ where: { id: approved.orderId } });
    expect(order).toMatchObject({
      manualDiscountPoisha: 25_000,
      discountApprovedByUserId: manager.userId,
    });
    // The branch manager's own limit is 15%: 10% needs no PIN.
    await sell(manager, discounted({}), meta());
  });

  it("sells the last piece once when two counters try at the same moment", async () => {
    const results = await Promise.allSettled([
      sell(seller, sale(mainDay, [["LAST", 1]], [{ method: "CASH", amount: "800" }]), meta()),
      sell(seller, sale(secondDay, [["LAST", 1]], [{ method: "CASH", amount: "800" }]), meta()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as { code: string }).code).toBe("OUT_OF_STOCK");
    expect(await stockOf(variants.LAST!, branchId)).toEqual({ onHand: 0, reserved: 0 });
  });

  it("refuses staff of another branch", async () => {
    expect(
      (
        await caught(
          sell(outsider, sale(mainDay, [["A", 1]], [{ method: "CASH", amount: "1000" }]), meta()),
        )
      ).code,
    ).toBe("LOCATION_FORBIDDEN");
  });

  it("holds a bill and gives it back once", async () => {
    await holdBill(seller, { sessionId: mainDay, label: "Blue shirt man", cart: { lines: [] } });
    const held = await getHeldBills(seller, mainDay);
    expect(held.map((bill) => bill.label)).toContain("Blue shirt man");
    const bill = held.find((row) => row.label === "Blue shirt man")!;
    await resumeHeldBill(seller, mainDay, bill.id);
    expect((await caught(resumeHeldBill(seller, mainDay, bill.id))).code).toBe("NOT_FOUND");
  });
});

describe("returns at the counter and closing the day", () => {
  it("refunds cash from the drawer, closes with the counted cash and locks the day", async () => {
    const bought = await sell(
      seller,
      sale(secondDay, [["A", 1]], [{ method: "CASH", amount: "1000" }]),
      meta(),
    );
    const order = await db.order.findUniqueOrThrow({
      where: { id: bought.orderId },
      include: { items: true },
    });
    const request = await createStaffReturn(
      manager,
      {
        orderId: order.id,
        type: "RETURN",
        reasonCode: "CHANGED_MIND",
        items: [{ orderItemId: order.items[0]!.id, quantity: 1 }],
      },
      meta(),
    );
    await approveReturn(manager, request.id, meta());
    await receiveReturn(manager, request.id, meta());
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: request.id } });
    await inspectReturn(
      manager,
      request.id,
      { locationId: branchId, items: [{ returnItemId: item.id, result: "ACCEPTED" }] },
      meta(),
    );
    expect(
      (
        await caught(
          recordRefund(
            manager,
            request.id,
            { method: "BKASH", reference: "X1", posSessionId: secondDay },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    await recordRefund(manager, request.id, { method: "CASH", posSessionId: secondDay }, meta());

    const live = await getDay(manager, secondDay);
    // Float 0 + cash sales on this counter − the 1,000 refunded from its drawer.
    const expected = live.report.expectedCashPoisha;
    expect(live.report.cashRefundsPoisha).toBe(100_000);
    expect(
      (
        await caught(
          closeDay(manager, secondDay, { countedCash: String(expected / 100 + 10) }, meta()),
        )
      ).message,
    ).toMatch(/over by ৳10/);
    const closed = await closeDay(
      manager,
      secondDay,
      { countedCash: String(expected / 100 + 10), reason: "Ten taka found in the drawer" },
      meta(),
    );
    expect(closed.report.differencePoisha).toBe(1_000);
    const saved = await db.posSession.findUniqueOrThrow({ where: { id: secondDay } });
    expect(saved).toMatchObject({ status: "CLOSED", countedCashPoisha: expected + 1_000 });
    expect(saved.zReport).toMatchObject({ bills: live.report.bills });

    // No more sales on it, and the database refuses changes to its bills.
    expect(
      (
        await caught(
          sell(seller, sale(secondDay, [["A", 1]], [{ method: "CASH", amount: "1000" }]), meta()),
        )
      ).code,
    ).toBe("CONFLICT");
    await expect(
      db.order.update({
        where: { id: bought.orderId },
        data: { discountPoisha: 1, totalPoisha: 99_999 },
      }),
    ).rejects.toThrow(/POS_DAY_CLOSED/);
    await expect(
      db.orderItem.update({
        where: { id: order.items[0]!.id },
        data: { quantity: 2, lineTotalPoisha: 200_000 },
      }),
    ).rejects.toThrow(/POS_DAY_CLOSED/);
    await expect(
      db.payment.updateMany({ where: { orderId: bought.orderId }, data: { amountPoisha: 1 } }),
    ).rejects.toThrow(/POS_DAY_CLOSED/);
    expect((await caught(closeDay(manager, secondDay, { countedCash: "0" }, meta()))).code).toBe(
      "CONFLICT",
    );
  });
});

describe("barcodes", () => {
  it("fills only empty barcodes with valid internal EAN-13 codes", async () => {
    const product = await db.product.create({
      data: {
        slug: `it-bc-${RUN.toLowerCase()}`,
        nameEn: `Barcode ${RUN}`,
        categoryId: (
          await db.category.findFirstOrThrow({ where: { slug: `it-pos-${RUN.toLowerCase()}` } })
        ).id,
        variants: {
          create: [
            { sku: `BC-${RUN}-1`, pricePoisha: 1_000 },
            { sku: `BC-${RUN}-2`, pricePoisha: 1_000, barcode: `KEEP${RUN}` },
          ],
        },
      },
      select: { variants: { select: { id: true, sku: true } } },
    });
    expect(
      (await caught(generateMissingBarcodes(await staffFor(RUN, "Content Editor"), meta()))).code,
    ).toBe("FORBIDDEN");
    await generateMissingBarcodes(seller, meta());
    const rows = await db.productVariant.findMany({
      where: { id: { in: product.variants.map((row) => row.id) } },
      orderBy: { sku: "asc" },
    });
    expect(isValidEan13(rows[0]!.barcode ?? "")).toBe(true);
    expect(rows[0]!.barcode!.startsWith("29")).toBe(true);
    expect(rows[1]!.barcode).toBe(`KEEP${RUN}`);
  });
});

describe("ledger", () => {
  it("still matches every stock row", async () => {
    expect((await findLedgerMismatches(db)).mismatches).toEqual([]);
  });
});
