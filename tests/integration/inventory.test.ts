import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES, type PermissionKey } from "@/modules/access/permissions";
import {
  adjust,
  applyImport,
  commitSale,
  exportMatrixCsv,
  getAvailability,
  getLowStock,
  getMatrix,
  getProductStockStatus,
  getVariantStock,
  previewImport,
  receive,
  release,
  reserve,
} from "@/modules/inventory/inventory.service";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import { deleteLocationForStaff, saveLocationForStaff } from "@/modules/inventory/location.service";
import {
  applyCount,
  getCount,
  listCounts,
  recordCount,
  startCount,
  submitCount,
} from "@/modules/inventory/stock-count.service";
import {
  cancelTransfer,
  listTransferDiscrepancies,
  listTransfersForStaff,
  saveTransferDraft,
  transferDispatch,
  transferReceive,
} from "@/modules/inventory/transfer.service";

/**
 * Inventory against the real test database: concurrency (no negative stock,
 * no deadlocks), CSV all-or-nothing, duplicate files, transfers in transit,
 * discrepancies, counts during sales, location access and the ledger check.
 * Every record carries a per-run prefix; nothing pre-existing is modified.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const META = { ip: "198.51.100.9", userAgent: "inventory-integration" };
let counter = 0;

async function actor(
  roleName: string,
  options: { locationIds?: string[]; permissions?: readonly PermissionKey[] } = {},
): Promise<StaffContext> {
  const definition = SYSTEM_ROLES.find((role) => role.name === roleName);
  if (definition === undefined) throw new Error(roleName);
  const role = await db.role.findFirstOrThrow({ where: { name: roleName } });
  const user = await db.user.create({
    data: {
      kind: "STAFF",
      email: `inv-${RUN.toLowerCase()}-${(counter += 1)}@test.local`,
      name: `${roleName} ${counter}`,
      roleId: role.id,
    },
  });
  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name,
    roleId: role.id,
    roleName,
    permissions: [...(options.permissions ?? definition.permissions)],
    allLocations: options.locationIds === undefined ? definition.allLocations : false,
    locationIds: options.locationIds ?? [],
    sessionId: "integration",
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

async function caught(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected an AppError");
}

async function level(variantId: string, locationId: string) {
  const row = await db.inventoryLevel.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
    select: { onHand: true, reserved: true },
  });
  return row ?? { onHand: 0, reserved: 0 };
}

let manager: StaffContext;
let categoryId: string;
const loc: Record<"A" | "B" | "C", string> = { A: "", B: "", C: "" };
const sku = (label: string) => `IT-${RUN}-${label}`;
const variant: Record<string, string> = {};
let productSlug = "";
/** The shared test database's default online location before this file ran. */
let previousDefault: Awaited<ReturnType<typeof db.location.findFirst>> = null;

async function location(suffix: "A" | "B" | "C", online: boolean) {
  const saved = await saveLocationForStaff(
    manager,
    {
      code: `I${RUN}-${suffix}`.slice(0, 20),
      type: suffix === "A" ? "WAREHOUSE" : "BRANCH",
      nameEn: `Integration ${suffix} ${RUN}`,
      isActive: true,
      isOnlineFulfillment: online,
      // Online stock is the default online location only (Phase 8), so the
      // online warehouse A takes the default for this file.
      isDefaultOnlineFulfillment: online,
    },
    META,
  );
  return saved.id;
}

beforeAll(async () => {
  manager = await actor("Store Manager");
  previousDefault = await db.location.findFirst({ where: { isDefaultOnlineFulfillment: true } });
  const category = await db.category.create({
    data: { slug: `it-inv-${RUN.toLowerCase()}`, nameEn: `Inventory ${RUN}` },
  });
  categoryId = category.id;
  productSlug = `it-inv-${RUN.toLowerCase()}`;
  const product = await db.product.create({
    data: {
      slug: productSlug,
      nameEn: `Integration Shirt ${RUN}`,
      categoryId,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: ["S", "M", "L", "XL", "CNT"].map((size) => ({
          sku: sku(size),
          barcode: `BC${RUN}${size}`,
          pricePoisha: 150_000,
          labelEn: size,
        })),
      },
    },
    select: { variants: { select: { id: true, sku: true } } },
  });
  for (const row of product.variants) variant[row.sku.split("-").pop() ?? ""] = row.id;
  loc.A = await location("A", true);
  loc.B = await location("B", false);
  loc.C = await location("C", false);
});

afterAll(async () => {
  // Hand the default back so later test files see the database as it was.
  if (previousDefault !== null) {
    await saveLocationForStaff(
      manager,
      {
        id: previousDefault.id,
        code: previousDefault.code,
        type: previousDefault.type,
        nameEn: previousDefault.nameEn,
        isActive: true,
        isOnlineFulfillment: true,
        isDefaultOnlineFulfillment: true,
      },
      META,
    );
  }
  await db.$disconnect();
});

// ---------------------------------------------------------------------------

describe("locations", () => {
  it("refuses a duplicate code and lowercase codes are upper-cased", async () => {
    const error = await caught(
      saveLocationForStaff(
        manager,
        { code: `i${RUN}-a`.slice(0, 20), type: "BRANCH", nameEn: "Dup" },
        META,
      ),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toContain("already used");
  });

  it("keeps exactly one default online location", async () => {
    const before = await db.location.findFirst({ where: { isDefaultOnlineFulfillment: true } });
    const temp = await saveLocationForStaff(
      manager,
      {
        code: `I${RUN}-D`.slice(0, 20),
        type: "WAREHOUSE",
        nameEn: "Temp default",
        isActive: true,
        isOnlineFulfillment: true,
        isDefaultOnlineFulfillment: true,
      },
      META,
    );
    expect(await db.location.count({ where: { isDefaultOnlineFulfillment: true } })).toBe(1);
    // Turning the default off without a replacement is refused.
    const error = await caught(
      saveLocationForStaff(
        manager,
        {
          id: temp.id,
          code: temp.code,
          type: "WAREHOUSE",
          nameEn: "Temp",
          isActive: true,
          isOnlineFulfillment: true,
        },
        META,
      ),
    );
    expect(error.message).toContain("Make another location the default first");
    // Hand the default back so the shared test database is as it was.
    if (before !== null) {
      await saveLocationForStaff(
        manager,
        {
          id: before.id,
          code: before.code,
          type: before.type,
          nameEn: before.nameEn,
          isActive: true,
          isOnlineFulfillment: true,
          isDefaultOnlineFulfillment: true,
        },
        META,
      );
    }
    expect(
      (await db.location.findUnique({ where: { id: temp.id } }))?.isDefaultOnlineFulfillment,
    ).toBe(false);
    // No history: it can be deleted.
    await deleteLocationForStaff(manager, temp.id, META);
    expect(await db.location.findUnique({ where: { id: temp.id } })).toBeNull();
  });
});

describe("receiving, cost and adjustments", () => {
  it("receives stock, writes the ledger with onHandAfter and averages the cost", async () => {
    await receive(
      manager,
      {
        locationId: loc.A,
        kind: "PURCHASE",
        lines: [{ variantId: variant.S, quantity: 10, unitCostPoisha: 50_000 }],
      },
      META,
    );
    await receive(
      manager,
      {
        locationId: loc.A,
        kind: "PURCHASE",
        lines: [{ variantId: variant.S, quantity: 10, unitCostPoisha: 70_000 }],
      },
      META,
    );
    expect(await level(variant.S!, loc.A)).toEqual({ onHand: 20, reserved: 0 });
    const cost = await db.productVariant.findUnique({
      where: { id: variant.S },
      select: { costPoisha: true },
    });
    expect(cost?.costPoisha).toBe(60_000);
    const last = await db.inventoryMovement.findFirst({
      where: { variantId: variant.S, locationId: loc.A },
      orderBy: { createdAt: "desc" },
    });
    expect(last).toMatchObject({
      type: "PURCHASE_RECEIVE",
      quantity: 10,
      onHandAfter: 20,
      unitCostPoisha: 70_000,
    });
  });

  it("allows OPENING only where the variant has no history at that location", async () => {
    const error = await caught(
      receive(
        manager,
        { locationId: loc.A, kind: "OPENING", lines: [{ variantId: variant.S, quantity: 1 }] },
        META,
      ),
    );
    expect(error.message).toContain("Already has history");
    await receive(
      manager,
      { locationId: loc.A, kind: "OPENING", lines: [{ variantId: variant.M, quantity: 30 }] },
      META,
    );
    expect((await level(variant.M!, loc.A)).onHand).toBe(30);
  });

  it("needs confirmation above the limit and never goes negative", async () => {
    const big = await caught(
      adjust(
        manager,
        { locationId: loc.A, variantId: variant.M, delta: -25, reason: "DAMAGED" },
        META,
      ),
    );
    expect(big.details?.needsConfirmation).toBe(true);
    const short = await caught(
      adjust(
        manager,
        { locationId: loc.A, variantId: variant.M, delta: -31, reason: "LOST", confirmed: true },
        META,
      ),
    );
    expect(short.code).toBe("OUT_OF_STOCK");
    expect(short.message).toContain(sku("M"));
    expect(short.message).toContain("1 short");
    const other = await caught(
      adjust(manager, { locationId: loc.A, variantId: variant.M, delta: 2, reason: "OTHER" }, META),
    );
    expect(other.message).toContain("note");
    await adjust(
      manager,
      { locationId: loc.A, variantId: variant.M, delta: -2, reason: "DAMAGED" },
      META,
    );
    expect((await level(variant.M!, loc.A)).onHand).toBe(28);
    expect(
      await db.auditLog.count({
        where: { action: "inventory.adjusted", entityId: `${variant.M}:${loc.A}` },
      }),
    ).toBe(1);
  });
});

describe("CSV import", () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const code = (suffix: "A" | "B" | "C") => `I${RUN}-${suffix}`.slice(0, 20);

  it("previews an Excel file (BOM, semicolons, Bengali digits, quoted thousands) and applies it", async () => {
    const file = encode(
      `﻿location_code;sku;quantity;unit_cost_tk\r\n` +
        `${code("B").toLowerCase()} ; ${sku("L").toLowerCase()} ; ১২ ; "1,250.50"\r\n` +
        `\r\n` +
        `${code("B")};${sku("L")};3;1250.50\r\n`,
    );
    const preview = await previewImport(manager, {
      fileName: "stock.csv",
      bytes: file,
      mode: "OPENING",
    });
    expect(preview.errors).toEqual([]);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toMatchObject({
      quantity: 15,
      unitCostPoisha: 125_050,
      status: "new",
      rows: [2, 4],
    });
    expect(preview.warnings.some((warning) => warning.message.includes("added together"))).toBe(
      true,
    );
    const result = await applyImport(
      manager,
      {
        fileName: "stock.csv",
        bytes: file,
        mode: "OPENING",
        expectedSha256: preview.sha256,
        confirmDuplicate: false,
      },
      META,
    );
    expect(result.totalQuantity).toBe(15);
    expect((await level(variant.L!, loc.B)).onHand).toBe(15);

    // The same file again: a warning, and a refusal without confirmation.
    const again = await previewImport(manager, {
      fileName: "stock.csv",
      bytes: file,
      mode: "PURCHASE",
    });
    expect(again.previousImports).toHaveLength(1);
    const duplicate = await caught(
      applyImport(
        manager,
        {
          fileName: "stock.csv",
          bytes: file,
          mode: "PURCHASE",
          expectedSha256: again.sha256,
          confirmDuplicate: false,
        },
        META,
      ),
    );
    expect(duplicate.code).toBe("CONFLICT");
    expect(duplicate.details?.reason).toBe("duplicate_file");
  });

  it("saves nothing when one row is wrong", async () => {
    const before = await db.inventoryMovement.count();
    const file = encode(
      `location_code,sku,quantity\n${code("B")},${sku("XL")},5\n${code("B")},NO-SUCH-SKU-${RUN},2\n`,
    );
    const preview = await previewImport(manager, {
      fileName: "bad.csv",
      bytes: file,
      mode: "PURCHASE",
    });
    expect(preview.canApply).toBe(false);
    expect(preview.errors[0]).toMatchObject({ row: 3 });
    const error = await caught(
      applyImport(
        manager,
        {
          fileName: "bad.csv",
          bytes: file,
          mode: "PURCHASE",
          expectedSha256: preview.sha256,
          confirmDuplicate: false,
        },
        META,
      ),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(await db.inventoryMovement.count()).toBe(before);
    expect((await level(variant.XL!, loc.B)).onHand).toBe(0);
  });

  it("explains an unquoted thousands comma", async () => {
    const file = encode(
      `location_code,sku,quantity,unit_cost_tk\n${code("B")},${sku("XL")},5,1,250\n`,
    );
    const preview = await previewImport(manager, {
      fileName: "comma.csv",
      bytes: file,
      mode: "PURCHASE",
    });
    expect(preview.errors[0]?.message).toContain("must be in quotes");
  });
});

describe("concurrency", () => {
  it("50 simultaneous reservations of one unit against 10 in stock: exactly 10 succeed", async () => {
    await receive(
      manager,
      { locationId: loc.C, kind: "PURCHASE", lines: [{ variantId: variant.XL, quantity: 10 }] },
      META,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, index) =>
        reserve(
          { system: true, label: "test" },
          {
            locationId: loc.C,
            lines: [{ variantId: variant.XL, quantity: 1 }],
            referenceType: "TEST",
            referenceId: `r${index}`,
          },
        ),
      ),
    );
    const ok = results.filter((result) => result.status === "fulfilled").length;
    expect(ok).toBe(10);
    for (const result of results) {
      if (result.status === "rejected")
        expect((result.reason as AppError).code).toBe("OUT_OF_STOCK");
    }
    expect(await level(variant.XL!, loc.C)).toEqual({ onHand: 10, reserved: 10 });
  });

  it("simultaneous sales from reservations and releases keep the totals right", async () => {
    const actions = Array.from({ length: 10 }, (_, index) =>
      index < 6
        ? commitSale(
            { system: true, label: "test" },
            {
              locationId: loc.C,
              channel: "ONLINE",
              lines: [{ variantId: variant.XL, quantity: 1 }],
              referenceType: "TEST",
              referenceId: `s${index}`,
            },
          )
        : release(
            { system: true, label: "test" },
            {
              locationId: loc.C,
              lines: [{ variantId: variant.XL, quantity: 1 }],
              referenceType: "TEST",
              referenceId: `x${index}`,
            },
          ),
    );
    await Promise.all(actions);
    expect(await level(variant.XL!, loc.C)).toEqual({ onHand: 4, reserved: 0 });
    // A till sale without reservation cannot oversell either.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        commitSale(
          { system: true, label: "test" },
          {
            locationId: loc.C,
            channel: "STORE",
            fromReservation: false,
            lines: [{ variantId: variant.XL, quantity: 1 }],
            referenceType: "TEST",
            referenceId: `t${index}`,
          },
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(await level(variant.XL!, loc.C)).toEqual({ onHand: 0, reserved: 0 });
  });

  it("opposite transfers at the same time never deadlock", async () => {
    await receive(
      manager,
      {
        locationId: loc.B,
        kind: "PURCHASE",
        lines: [
          { variantId: variant.S, quantity: 40 },
          { variantId: variant.M, quantity: 40 },
        ],
      },
      META,
    );
    await receive(
      manager,
      {
        locationId: loc.C,
        kind: "PURCHASE",
        lines: [
          { variantId: variant.S, quantity: 40 },
          { variantId: variant.M, quantity: 40 },
        ],
      },
      META,
    );
    const lines = [
      { variantId: variant.M!, quantity: 1 },
      { variantId: variant.S!, quantity: 1 },
    ];
    const pairs = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const forward = await saveTransferDraft(
          manager,
          { fromLocationId: loc.B, toLocationId: loc.C, lines },
          META,
        );
        const backward = await saveTransferDraft(
          manager,
          { fromLocationId: loc.C, toLocationId: loc.B, lines: [...lines].reverse() },
          META,
        );
        return [forward.id, backward.id] as const;
      }),
    );
    await Promise.all(
      pairs.flatMap(([forward, backward]) => [
        transferDispatch(manager, forward, META),
        transferDispatch(manager, backward, META),
      ]),
    );
    const receiveAll = async (id: string) => {
      const items = await db.stockTransferItem.findMany({
        where: { transferId: id },
        select: { id: true, quantitySent: true },
      });
      return transferReceive(
        manager,
        {
          transferId: id,
          lines: items.map((item) => ({ itemId: item.id, quantityReceived: item.quantitySent })),
        },
        META,
      );
    };
    await Promise.all(
      pairs.flatMap(([forward, backward]) => [receiveAll(forward), receiveAll(backward)]),
    );
    expect(await level(variant.S!, loc.B)).toEqual({ onHand: 40, reserved: 0 });
    expect(await level(variant.M!, loc.C)).toEqual({ onHand: 40, reserved: 0 });
  });
});

describe("transfers", () => {
  it("keeps stock in transit out of every location's available stock", async () => {
    const created = await saveTransferDraft(
      manager,
      {
        fromLocationId: loc.A,
        toLocationId: loc.B,
        lines: [{ variantId: variant.S, quantity: 5 }],
      },
      META,
    );
    const onlineBefore =
      (await getAvailability({ online: true }, [variant.S!])).get(variant.S!) ?? 0;
    await transferDispatch(manager, created.id, META);
    expect((await getAvailability({ locationId: loc.A }, [variant.S!])).get(variant.S!)).toBe(15);
    expect((await getAvailability({ locationId: loc.B }, [variant.S!])).get(variant.S!)).toBe(40);
    expect((await getAvailability({ online: true }, [variant.S!])).get(variant.S!)).toBe(
      onlineBefore - 5,
    );
    const matrix = await getMatrix(manager, { q: sku("S") });
    expect(
      matrix.rows.find((row) => row.variantId === variant.S)?.inTransit,
    ).toBeGreaterThanOrEqual(5);

    const cancel = await caught(
      cancelTransfer(manager, { transferId: created.id, reason: "changed mind" }, META),
    );
    expect(cancel.code).toBe("CONFLICT");
    expect(cancel.message).toContain("cannot be cancelled");

    // Short receipt: a reason is required, and the shortage is in the ledger.
    const [item] = await db.stockTransferItem.findMany({ where: { transferId: created.id } });
    const noReason = await caught(
      transferReceive(
        manager,
        { transferId: created.id, lines: [{ itemId: item!.id, quantityReceived: 3 }] },
        META,
      ),
    );
    expect(noReason.message).toContain("Choose why");
    await transferReceive(
      manager,
      {
        transferId: created.id,
        lines: [{ itemId: item!.id, quantityReceived: 3, reason: "DAMAGED" }],
      },
      META,
    );
    expect((await level(variant.S!, loc.B)).onHand).toBe(43);
    const discrepancy = await db.inventoryMovement.findFirst({
      where: { referenceId: created.id, type: "TRANSFER_DISCREPANCY" },
    });
    expect(discrepancy).toMatchObject({ quantity: -2, reasonCode: "DAMAGED", locationId: loc.B });
  });

  it("records more than sent as an EXCESS discrepancy", async () => {
    const created = await saveTransferDraft(
      manager,
      {
        fromLocationId: loc.B,
        toLocationId: loc.C,
        lines: [{ variantId: variant.M, quantity: 2 }],
      },
      META,
    );
    await transferDispatch(manager, created.id, META);
    const [item] = await db.stockTransferItem.findMany({ where: { transferId: created.id } });
    await transferReceive(
      manager,
      { transferId: created.id, lines: [{ itemId: item!.id, quantityReceived: 3 }] },
      META,
    );
    const saved = await db.stockTransferItem.findUnique({ where: { id: item!.id } });
    expect(saved).toMatchObject({ quantityReceived: 3, discrepancyReason: "EXCESS" });
  });

  it("lets only the source dispatch and only the destination receive (403 otherwise)", async () => {
    const branchB = await actor("Branch Manager", { locationIds: [loc.B] });
    const branchC = await actor("Branch Manager", { locationIds: [loc.C] });
    const created = await saveTransferDraft(
      branchB,
      {
        fromLocationId: loc.B,
        toLocationId: loc.C,
        lines: [{ variantId: variant.M, quantity: 1 }],
      },
      META,
    );
    expect((await caught(transferDispatch(branchC, created.id, META))).code).toBe(
      "LOCATION_FORBIDDEN",
    );
    await transferDispatch(branchB, created.id, META);
    const [item] = await db.stockTransferItem.findMany({ where: { transferId: created.id } });
    const receiveInput = {
      transferId: created.id,
      lines: [{ itemId: item!.id, quantityReceived: 1 }],
    };
    expect((await caught(transferReceive(branchB, receiveInput, META))).code).toBe(
      "LOCATION_FORBIDDEN",
    );
    await transferReceive(branchC, receiveInput, META);
  });
});

describe("location access", () => {
  it("gives a branch's staff 403 for another branch", async () => {
    const sales = await actor("Branch Sales Staff", { locationIds: [loc.B] });
    expect((await caught(getMatrix(sales, { locationId: loc.C }))).code).toBe("LOCATION_FORBIDDEN");
    const own = await getMatrix(sales, { q: sku("S") });
    expect(own.locations.map((location) => location.id)).toEqual([loc.B]);
    expect(own.showCost).toBe(false);
    expect(own.rows[0]).not.toHaveProperty("costPoisha");
    const branchManager = await actor("Branch Manager", { locationIds: [loc.B] });
    expect(
      (
        await caught(
          adjust(
            branchManager,
            { locationId: loc.C, variantId: variant.S, delta: 1, reason: "FOUND" },
            META,
          ),
        )
      ).code,
    ).toBe("LOCATION_FORBIDDEN");
    // Branch Manager has no receive permission.
    expect(
      (
        await caught(
          receive(
            branchManager,
            { locationId: loc.B, lines: [{ variantId: variant.S, quantity: 1 }] },
            META,
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
  });
});

describe("stock counts", () => {
  it("corrects only real differences when sales happen during the count", async () => {
    // loc.A holds 28 of M (from the adjustment test).
    const count = await startCount(manager, { locationId: loc.A }, META);
    const second = await caught(startCount(manager, { locationId: loc.A }, META));
    expect(second.code).toBe("CONFLICT");

    // A sale after the snapshot, before the shelf is counted.
    await commitSale(
      { system: true, label: "test" },
      {
        locationId: loc.A,
        channel: "STORE",
        fromReservation: false,
        lines: [{ variantId: variant.M, quantity: 3 }],
        referenceType: "TEST",
        referenceId: "during-count",
      },
    );
    // The shelf now really holds 25 of M: counted correctly -> no correction.
    await recordCount(manager, {
      countId: count.id,
      mode: "set",
      variantId: variant.M,
      countedQty: 25,
    });
    // Scans: 2 of CNT, which had no stock row here (system 0) -> +2.
    await recordCount(manager, { countId: count.id, mode: "scan", code: sku("CNT").toLowerCase() });
    await recordCount(manager, { countId: count.id, mode: "scan", code: `BC${RUN}CNT` });
    expect(
      (await caught(recordCount(manager, { countId: count.id, mode: "scan", code: "NOPE-404" })))
        .code,
    ).toBe("NOT_FOUND");
    // A sale after M was counted is not part of the count.
    await commitSale(
      { system: true, label: "test" },
      {
        locationId: loc.A,
        channel: "STORE",
        fromReservation: false,
        lines: [{ variantId: variant.M, quantity: 1 }],
        referenceType: "TEST",
        referenceId: "after-count",
      },
    );

    await submitCount(manager, count.id, META);
    const inventoryStaff = await actor("Inventory Staff", { locationIds: [loc.A] });
    expect((await caught(applyCount(inventoryStaff, { countId: count.id }, META))).code).toBe(
      "FORBIDDEN",
    );
    const review = await getCount(manager, count.id);
    expect(review.uncounted).toBeGreaterThan(0); // S was not counted
    const zero = await caught(
      applyCount(manager, { countId: count.id, zeroUncounted: true }, META),
    );
    expect(zero.details?.needsConfirmation).toBe(true);

    const sBefore = (await level(variant.S!, loc.A)).onHand;
    await applyCount(manager, { countId: count.id }, META);
    expect((await level(variant.M!, loc.A)).onHand).toBe(24);
    expect((await level(variant.CNT!, loc.A)).onHand).toBe(2);
    expect((await level(variant.S!, loc.A)).onHand).toBe(sBefore); // uncounted: unchanged
    const corrections = await db.inventoryMovement.findMany({
      where: { referenceId: count.id, type: "COUNT_CORRECTION" },
    });
    expect(corrections.map((row) => row.quantity)).toEqual([2]);
  });
});

describe("storefront status and the ledger", () => {
  it("reports in / few / out for online stock only", async () => {
    const status = await getProductStockStatus(productSlug);
    expect(status[variant.S!]).toBe("in"); // 15 at the default online warehouse A
    expect(status[variant.L!]).toBe("out"); // only at branch B, which is not online
    expect(status[variant.CNT!]).toBe("few"); // 2 <= 3
  });

  it("every stock row equals its ledger (inventory:verify)", async () => {
    const result = await findLedgerMismatches(db);
    expect(result.mismatches).toEqual([]);
  });
});

describe("admin read models", () => {
  it("lists low stock, transfers, discrepancies, counts and history for the caller's scope", async () => {
    const low = await getLowStock(manager, 100);
    expect(low.rows.some((row) => row.sku === sku("XL"))).toBe(true); // 0 left at loc.C
    const transfers = await listTransfersForStaff(manager, { locationId: loc.B });
    expect(transfers.rows.length).toBeGreaterThan(0);
    const discrepancies = await listTransferDiscrepancies(manager);
    expect(discrepancies.rows.some((row) => row.discrepancyReason === "EXCESS")).toBe(true);
    const counts = await listCounts(manager, {});
    expect(counts.rows.some((row) => row.status === "APPLIED")).toBe(true);
    const history = await getVariantStock(manager, variant.M!, {
      locationId: loc.A,
      type: "COUNT_CORRECTION",
    });
    expect(history.movements.every((movement) => movement.type === "COUNT_CORRECTION")).toBe(true);

    const branch = await actor("Branch Sales Staff", { locationIds: [loc.B] });
    const branchLow = await getLowStock(branch, 100);
    expect(branchLow.rows.every((row) => row.locationCode === `I${RUN}-B`.slice(0, 20))).toBe(true);
    const branchTransfers = await listTransfersForStaff(branch, {});
    expect(
      branchTransfers.rows.every((row) => row.from.endsWith("-B") || row.to.endsWith("-B")),
    ).toBe(true);
    expect((await caught(listTransfersForStaff(branch, { locationId: loc.C }))).code).toBe(
      "LOCATION_FORBIDDEN",
    );

    const csv = await exportMatrixCsv(manager, { q: sku("S") });
    expect(csv.split("\r\n")[0]).toContain("unit_cost_tk");
    const branchCsv = await exportMatrixCsv(branch, { q: sku("S") });
    expect(branchCsv).not.toContain("unit_cost_tk");
  });
});
