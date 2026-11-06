import { describe, expect, it } from "vitest";

import {
  formatMoney,
  MoneyError,
  multiplyPoisha,
  percentageOfPoisha,
  poishaToTaka,
  sumPoisha,
  takaToPoisha,
} from "@/lib/money";

describe("money", () => {
  it("converts taka to integer poisha", () => {
    expect(takaToPoisha(1250)).toBe(125_000);
    expect(takaToPoisha(70)).toBe(7_000);
    // 0.1 + 0.2 style float noise must not leak into stored amounts
    expect(takaToPoisha(19.99)).toBe(1_999);
  });

  it("rejects non-integer poisha amounts", () => {
    expect(() => poishaToTaka(1.5)).toThrow(MoneyError);
    expect(() => sumPoisha([100, 10.5])).toThrow(MoneyError);
  });

  it("sums and multiplies without floating point drift", () => {
    expect(sumPoisha([7_000, 125_000, 1_999])).toBe(133_999);
    expect(multiplyPoisha(1_999, 3)).toBe(5_997);
  });

  it("rejects invalid quantities", () => {
    expect(() => multiplyPoisha(1_000, -1)).toThrow(MoneyError);
    expect(() => multiplyPoisha(1_000, 1.5)).toThrow(MoneyError);
  });

  it("rounds percentage discounts to whole poisha", () => {
    // 10% of 19.99 BDT = 1.999 poisha-rounded to 200
    expect(percentageOfPoisha(1_999, 10)).toBe(200);
    expect(percentageOfPoisha(125_000, 15)).toBe(18_750);
    expect(() => percentageOfPoisha(1_000, 120)).toThrow(MoneyError);
  });

  it("uses Latin digits and the taka sign in both languages", () => {
    // Business decision (Phase 3): prices read identically in bn and en.
    expect(formatMoney(125_000, "bn")).toBe("৳1,250");
    expect(formatMoney(125_000, "en")).toBe("৳1,250");
  });

  it("can still render Bengali digits when explicitly asked", () => {
    expect(formatMoney(125_000, "bn", { numerals: "bengali" })).toContain("১");
  });

  it("shows poisha only when the amount is not a whole number of taka", () => {
    expect(formatMoney(125_050, "en")).toBe("৳1,250.50");
    expect(formatMoney(125_000, "en", { showPoisha: true })).toBe("৳1,250.00");
  });
});
