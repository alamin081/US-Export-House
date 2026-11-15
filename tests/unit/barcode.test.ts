import { describe, expect, it } from "vitest";

import {
  barRuns,
  CODE128_PATTERNS,
  code128Modules,
  code128Values,
  ean13CheckDigit,
  ean13Modules,
  internalEan13,
  isValidEan13,
} from "@/modules/labels/barcode";

/** A small independent decoder: modules -> element widths -> symbol values. */
function decodeCode128(modules: readonly boolean[]): string {
  const widths: number[] = [];
  let run = 1;
  for (let index = 1; index <= modules.length; index += 1) {
    if (index < modules.length && modules[index] === modules[index - 1]) run += 1;
    else {
      widths.push(run);
      run = 1;
    }
  }
  const lookup = new Map<string, number>(
    CODE128_PATTERNS.map((pattern, value) => [pattern, value]),
  );
  const values: number[] = [];
  for (let index = 0; index + 6 <= widths.length - 7; index += 6) {
    values.push(lookup.get(widths.slice(index, index + 6).join(""))!);
  }
  expect(widths.slice(-7).join("")).toBe("2331112");
  const [start, ...rest] = values;
  expect(start).toBe(104);
  const checksum = rest.pop()!;
  const sum = [start!, ...rest].reduce((total, value, index) => total + value * (index || 1), 0);
  expect(sum % 103).toBe(checksum);
  return rest.map((value) => String.fromCharCode(value + 32)).join("");
}

describe("EAN-13", () => {
  it("computes the standard check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("590123412345")).toBe(7);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
  });

  it("makes internal codes in the 29 range with a valid check digit", () => {
    expect(internalEan13(1)).toBe("2900000000018");
    expect(internalEan13(1234567890)).toMatch(/^291234567890\d$/);
    for (const sequence of [1, 2, 99, 12_345, 9_999_999_999]) {
      const code = internalEan13(sequence);
      expect(code).toHaveLength(13);
      expect(code.startsWith("29")).toBe(true);
      expect(isValidEan13(code)).toBe(true);
    }
    expect(() => internalEan13(0)).toThrow();
    expect(() => internalEan13(10_000_000_000)).toThrow();
  });

  it("draws 95 modules with the guard bars in place", () => {
    const modules = ean13Modules("4006381333931");
    expect(modules).toHaveLength(95);
    expect(modules.slice(0, 3)).toEqual([true, false, true]);
    expect(modules.slice(45, 50)).toEqual([false, true, false, true, false]);
    expect(modules.slice(92)).toEqual([true, false, true]);
  });
});

describe("Code 128", () => {
  it("has 107 well-formed patterns", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const total = [...pattern].reduce((sum, width) => sum + Number(width), 0);
      expect(total).toBe(value === 106 ? 13 : 11);
    });
  });

  it("computes the checksum (known example)", () => {
    // Wikipedia's "PJJ123C" is 54 with start A (103); with start B (104) it is 55.
    expect(code128Values("PJJ123C").at(-1)).toBe(55);
  });

  it("round-trips order and invoice numbers", () => {
    for (const text of ["UEH-2611-00012", "INV-2611-00001", "COD-2611-00003", "a b~"]) {
      expect(decodeCode128(code128Modules(text))).toBe(text);
    }
    expect(() => code128Modules("")).toThrow();
    expect(() => code128Modules("ঢাকা")).toThrow();
  });

  it("collapses modules into bar runs", () => {
    expect(barRuns([true, true, false, true, false, false, true])).toEqual([
      [0, 2],
      [3, 1],
      [6, 1],
    ]);
  });
});
