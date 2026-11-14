import { describe, expect, it } from "vitest";

import {
  adjustmentMovement,
  availableOf,
  effectiveThreshold,
  formatDocumentReference,
  isValidChange,
  lowStockState,
  movementDeltas,
  needsLargeAdjustmentConfirmation,
  reconcileCountLine,
  stockStatus,
  weightedAverageCost,
} from "@/modules/inventory/inventory-rules";
import { compareLevelKeys, mergeLines, sortedUniqueKeys } from "@/modules/inventory/lock-order";
import {
  detectDelimiter,
  parseDecimal,
  parseStockCsv,
  STOCK_CSV_TEMPLATE,
  toLatinDigits,
} from "@/modules/inventory/stock-csv";
import {
  canTransfer,
  lineDiscrepancy,
  resolveReceiveLine,
} from "@/modules/inventory/transfer-rules";
import { SYSTEM_ROLES, type PermissionKey } from "@/modules/access/permissions";
import {
  parseInventorySettings,
  DEFAULT_INVENTORY_SETTINGS,
} from "@/modules/settings/inventory-settings";

describe("available stock", () => {
  it("is onHand minus reserved, never negative", () => {
    expect(availableOf({ onHand: 10, reserved: 3 })).toBe(7);
    expect(availableOf({ onHand: 2, reserved: 2 })).toBe(0);
    expect(availableOf({ onHand: 1, reserved: 5 })).toBe(0);
  });

  it("routes RESERVE / RELEASE to reserved and everything else to onHand", () => {
    expect(movementDeltas("RESERVE", 2)).toEqual({ onHand: 0, reserved: 2 });
    expect(movementDeltas("RELEASE", -2)).toEqual({ onHand: 0, reserved: -2 });
    expect(movementDeltas("SALE_ONLINE", -1)).toEqual({ onHand: -1, reserved: 0 });
  });

  it("refuses changes that go negative or reserve more than is on hand", () => {
    const level = { onHand: 5, reserved: 3 };
    expect(isValidChange(level, { onHand: -2, reserved: 0 })).toBe(true);
    expect(isValidChange(level, { onHand: -3, reserved: 0 })).toBe(false); // would eat reserved stock
    expect(isValidChange(level, { onHand: 0, reserved: 2 })).toBe(true);
    expect(isValidChange(level, { onHand: 0, reserved: 3 })).toBe(false);
    expect(isValidChange(level, { onHand: 0, reserved: -4 })).toBe(false);
    // commitSale from a reservation: RELEASE then SALE.
    expect(isValidChange({ onHand: 5, reserved: 3 }, { onHand: -3, reserved: -3 })).toBe(true);
  });
});

describe("storefront status and low stock", () => {
  it("shows three states, never a number", () => {
    expect(stockStatus(0, 3)).toBe("out");
    expect(stockStatus(-1, 3)).toBe("out");
    expect(stockStatus(1, 3)).toBe("few");
    expect(stockStatus(3, 3)).toBe("few");
    expect(stockStatus(4, 3)).toBe("in");
  });

  it("uses the row's threshold before the global setting", () => {
    expect(effectiveThreshold(null, 5)).toBe(5);
    expect(effectiveThreshold(2, 5)).toBe(2);
    expect(effectiveThreshold(0, 5)).toBe(0);
    expect(lowStockState(0, 5)).toBe("out");
    expect(lowStockState(5, 5)).toBe("low");
    expect(lowStockState(6, 5)).toBe("ok");
  });
});

describe("weighted average cost", () => {
  it("averages by quantity and rounds to whole poisha", () => {
    expect(
      weightedAverageCost({
        currentQty: 10,
        currentCostPoisha: 50_000,
        receivedQty: 10,
        unitCostPoisha: 70_000,
      }),
    ).toBe(60_000);
    expect(
      weightedAverageCost({
        currentQty: 3,
        currentCostPoisha: 100,
        receivedQty: 1,
        unitCostPoisha: 101,
      }),
    ).toBe(100); // 100.25 -> 100
  });

  it("takes the new cost when nothing (or no cost) is known yet", () => {
    expect(
      weightedAverageCost({
        currentQty: 0,
        currentCostPoisha: 50_000,
        receivedQty: 5,
        unitCostPoisha: 80_000,
      }),
    ).toBe(80_000);
    expect(
      weightedAverageCost({
        currentQty: 7,
        currentCostPoisha: null,
        receivedQty: 5,
        unitCostPoisha: 80_000,
      }),
    ).toBe(80_000);
  });

  it("leaves the average alone when the receipt has no cost", () => {
    expect(
      weightedAverageCost({
        currentQty: 7,
        currentCostPoisha: 1_000,
        receivedQty: 5,
        unitCostPoisha: null,
      }),
    ).toBe(1_000);
  });
});

describe("adjustments", () => {
  it("maps reasons to ledger types and refuses the wrong direction", () => {
    expect(adjustmentMovement("DAMAGED", -2)).toEqual({ type: "DAMAGE" });
    expect(adjustmentMovement("LOST", -1)).toEqual({ type: "ADJUSTMENT_OUT" });
    expect(adjustmentMovement("FOUND", 3)).toEqual({ type: "ADJUSTMENT_IN" });
    expect(adjustmentMovement("CORRECTION", -4)).toEqual({ type: "ADJUSTMENT_OUT" });
    expect(adjustmentMovement("OTHER", 4)).toEqual({ type: "ADJUSTMENT_IN" });
    expect(adjustmentMovement("DAMAGED", 2)).toHaveProperty("error");
    expect(adjustmentMovement("FOUND", -2)).toHaveProperty("error");
    expect(adjustmentMovement("CORRECTION", 0)).toHaveProperty("error");
  });

  it("asks for confirmation above the limit only", () => {
    expect(needsLargeAdjustmentConfirmation(20, 20)).toBe(false);
    expect(needsLargeAdjustmentConfirmation(-21, 20)).toBe(true);
  });
});

describe("stock count reconciliation", () => {
  it("counts sales made after the snapshot as expected, not missing", () => {
    // Snapshot 10, 2 sold before the shelf was counted, 8 on the shelf.
    expect(
      reconcileCountLine({ systemQty: 10, movementsSinceSnapshot: -2, countedQty: 8 }),
    ).toEqual({
      expectedQty: 8,
      difference: 0,
    });
    // One really missing.
    expect(
      reconcileCountLine({ systemQty: 10, movementsSinceSnapshot: -2, countedQty: 7 }).difference,
    ).toBe(-1);
    // A transfer arrived during the count.
    expect(
      reconcileCountLine({ systemQty: 4, movementsSinceSnapshot: 6, countedQty: 10 }).difference,
    ).toBe(0);
  });

  it("formats document references", () => {
    expect(formatDocumentReference("TRF", 2026, 7)).toBe("TRF-2026-0007");
    expect(formatDocumentReference("CNT", 2026, 12345)).toBe("CNT-2026-12345");
  });
});

describe("lock order", () => {
  it("sorts by variant then location and removes duplicates", () => {
    const keys = [
      { variantId: "b", locationId: "y" },
      { variantId: "a", locationId: "z" },
      { variantId: "b", locationId: "x" },
      { variantId: "a", locationId: "z" },
    ];
    expect(sortedUniqueKeys(keys)).toEqual([
      { variantId: "a", locationId: "z" },
      { variantId: "b", locationId: "x" },
      { variantId: "b", locationId: "y" },
    ]);
    expect(
      compareLevelKeys({ variantId: "a", locationId: "b" }, { variantId: "a", locationId: "b" }),
    ).toBe(0);
  });

  it("merges duplicate lines by adding quantities", () => {
    expect(
      mergeLines([
        { variantId: "v2", locationId: "l", quantity: 1 },
        { variantId: "v1", locationId: "l", quantity: 2 },
        { variantId: "v2", locationId: "l", quantity: 3 },
      ]),
    ).toEqual([
      { variantId: "v1", locationId: "l", quantity: 2 },
      { variantId: "v2", locationId: "l", quantity: 4 },
    ]);
  });
});

describe("transfer state and discrepancies", () => {
  const off = { requireApproval: false };
  const on = { requireApproval: true };

  it("follows DRAFT -> DISPATCHED -> RECEIVED without approval", () => {
    expect(canTransfer("DRAFT", "dispatch", off)).toBe(true);
    expect(canTransfer("DRAFT", "approve", off)).toBe(false);
    expect(canTransfer("DISPATCHED", "receive", off)).toBe(true);
    expect(canTransfer("RECEIVED", "receive", off)).toBe(false);
  });

  it("needs APPROVED before dispatch when approval is on", () => {
    expect(canTransfer("DRAFT", "dispatch", on)).toBe(false);
    expect(canTransfer("DRAFT", "approve", on)).toBe(true);
    expect(canTransfer("APPROVED", "dispatch", on)).toBe(true);
    // Approval switched off later: an APPROVED transfer can still go.
    expect(canTransfer("APPROVED", "dispatch", off)).toBe(true);
  });

  it("never cancels a dispatched transfer", () => {
    expect(canTransfer("DRAFT", "cancel", off)).toBe(true);
    expect(canTransfer("APPROVED", "cancel", on)).toBe(true);
    expect(canTransfer("DISPATCHED", "cancel", off)).toBe(false);
    expect(canTransfer("RECEIVED", "cancel", off)).toBe(false);
    expect(canTransfer("DISPATCHED", "edit", off)).toBe(false);
  });

  it("classifies differences and requires a reason for shortages", () => {
    expect(lineDiscrepancy(5, 5)).toEqual({ difference: 0, kind: "none" });
    expect(lineDiscrepancy(5, 3)).toEqual({ difference: -2, kind: "short" });
    expect(lineDiscrepancy(5, 6)).toEqual({ difference: 1, kind: "excess" });
    expect(resolveReceiveLine(5, 5, "LOST")).toEqual({ reason: null });
    expect(resolveReceiveLine(5, 0, null)).toHaveProperty("error");
    expect(resolveReceiveLine(5, 0, "LOST")).toEqual({ reason: "LOST" });
    expect(resolveReceiveLine(5, 7, null)).toEqual({ reason: "EXCESS" });
    expect(resolveReceiveLine(5, -1, null)).toHaveProperty("error");
    expect(resolveReceiveLine(5, 2.5, "LOST")).toHaveProperty("error");
  });
});

describe("stock CSV parser", () => {
  const parse = (text: string, maxRows = 5000) => parseStockCsv(text, { maxRows });

  it("reads the template", () => {
    const result = parse(STOCK_CSV_TEMPLATE);
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      {
        locationCode: "WH-01",
        sku: "UEH-FS0001-WHT-L",
        quantity: 25,
        unitCostPoisha: 125_000,
        rows: [2],
      },
      {
        locationCode: "WH-01",
        sku: "UEH-FS0001-WHT-XL",
        quantity: 10,
        unitCostPoisha: null,
        rows: [3],
      },
    ]);
  });

  it("handles a UTF-8 BOM, semicolons, blank rows, spaces and letter case", () => {
    const result = parse(
      "﻿Location_Code ; SKU ; Quantity ; Unit_Cost_Tk\r\n\r\n wh-01 ; ueh-a-1 ; 5 ; 10.5 \r\n;;;\r\n",
    );
    expect(result.delimiter).toBe(";");
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      { locationCode: "WH-01", sku: "ueh-a-1", quantity: 5, unitCostPoisha: 1_050, rows: [3] },
    ]);
  });

  it("accepts Bengali digits and thousands commas inside quotes", () => {
    expect(toLatinDigits("১২৫০")).toBe("1250");
    const result = parse(
      'location_code,sku,quantity,unit_cost_tk\nWH-01,A-1,"১,২৫০","৳ 1,250.75"\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({ quantity: 1250, unitCostPoisha: 125_075 });
    expect(parseDecimal("12,50,000")).toBe(1_250_000);
    expect(parseDecimal("1,25")).toBeNull(); // ambiguous: decimal comma or a typo
  });

  it("explains an unquoted thousands comma instead of reading a wrong number", () => {
    const result = parse("location_code,sku,quantity,unit_cost_tk\nWH-01,A-1,5,1,250\n");
    expect(result.lines).toEqual([]);
    expect(result.errors[0]).toMatchObject({ row: 2 });
    expect(result.errors[0]?.message).toContain("must be in quotes");
  });

  it("reports wrong numbers with the row number", () => {
    const result = parse(
      "location_code,sku,quantity,unit_cost_tk\nWH-01,A-1,abc,\nWH-01,A-2,2.5,\nWH-01,A-3,-4,\nWH-01,A-4,3,12.345\nWH-01,A-5,0,\n",
    );
    expect(result.errors.map((error) => error.row)).toEqual([2, 3, 4, 5]);
    expect(result.errors[2]?.message).toContain("negative");
    expect(result.errors[3]?.message).toContain("2 decimal places");
    expect(result.warnings[0]).toMatchObject({ row: 6 });
  });

  it("keeps Bengali text in extra columns and fields with quotes and line breaks", () => {
    const result = parse(
      'location_code,sku,quantity,product_name\nWH-01,A-1,2,"নেভি ব্লু শার্ট, ""স্লিম"""\nWH-01,A-2,1,"two\nlines"\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.lines.map((line) => line.rows)).toEqual([[2], [3]]);
  });

  it("adds up rows for the same location and SKU, remembering the rows", () => {
    const result = parse(
      "location_code,sku,quantity,unit_cost_tk\nWH-01,A-1,2,100\nwh-01,a-1,6,200\nWH-02,A-1,1,\n",
    );
    expect(result.lines[0]).toMatchObject({ quantity: 8, unitCostPoisha: 17_500, rows: [2, 3] });
    expect(result.warnings[0]?.message).toContain("Rows 2, 3");
    const mixed = parse("location_code,sku,quantity,unit_cost_tk\nWH-01,A-1,2,100\nWH-01,A-1,6,\n");
    expect(mixed.errors[0]?.message).toContain("only some have a unit cost");
  });

  it("refuses files without the required columns or with too many rows", () => {
    expect(parse("sku,quantity\nA,1\n").errors[0]?.message).toContain("location_code");
    expect(parse("").errors[0]?.message).toContain("empty");
    expect(parse("location_code,sku,quantity\nA,B,1\nA,C,1\n", 1).errors[0]?.message).toContain(
      "limit is 1",
    );
  });

  it("detects the delimiter from the header", () => {
    expect(detectDelimiter("a;b;c\n1,2;3")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });
});

describe("inventory settings", () => {
  it("falls back to the defaults for missing or bad rows", () => {
    const settings = parseInventorySettings(
      new Map([
        ["storefront.fewLeftThreshold", "4"],
        ["transfer.requireApproval", "true"],
        ["inventory.import.maxRows", "-3"],
      ]),
    );
    expect(settings.fewLeftThreshold).toBe(4);
    expect(settings.transferRequireApproval).toBe(true);
    expect(settings.importMaxRows).toBe(DEFAULT_INVENTORY_SETTINGS.importMaxRows);
    expect(settings.lowStockDefaultThreshold).toBe(5);
  });
});

describe("inventory permissions per role", () => {
  const has = (role: string, key: PermissionKey) =>
    SYSTEM_ROLES.find((candidate) => candidate.name === role)?.permissions.includes(key) ?? false;

  it("keeps purchase cost away from branch and inventory staff", () => {
    for (const role of [
      "Branch Sales Staff",
      "Branch Manager",
      "Inventory Staff",
      "Order Staff",
      "Content Editor",
    ]) {
      expect(has(role, "inventory.cost.read")).toBe(false);
    }
    expect(has("Store Manager", "inventory.cost.read")).toBe(true);
  });

  it("lets only managers apply counts, approve transfers and manage locations", () => {
    for (const key of ["inventory.count.apply", "transfer.approve", "location.manage"] as const) {
      expect(
        SYSTEM_ROLES.filter((role) => role.permissions.includes(key))
          .map((role) => role.name)
          .sort(),
      ).toEqual(["Store Manager", "Super Admin"]);
    }
  });

  it("gives receiving to inventory staff but not to branch managers", () => {
    expect(has("Inventory Staff", "inventory.receive")).toBe(true);
    expect(has("Branch Manager", "inventory.receive")).toBe(false);
    expect(has("Branch Manager", "inventory.count")).toBe(true);
    expect(has("Branch Sales Staff", "inventory.read")).toBe(true);
    expect(has("Branch Sales Staff", "inventory.adjust")).toBe(false);
    expect(has("Content Editor", "inventory.read")).toBe(false);
  });
});
