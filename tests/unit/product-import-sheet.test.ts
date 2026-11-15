import { describe, expect, it } from "vitest";

import {
  conflictingSlots,
  matchImageName,
  type ImageMatchProduct,
} from "@/modules/catalog/import/image-names";
import {
  groupProducts,
  hasHtml,
  headerKey,
  IMPORT_COLUMNS,
  isClear,
  parseMoneyCell,
  parseWholeNumber,
  readProductSheet,
  splitList,
  tableFromCsv,
} from "@/modules/catalog/import/product-sheet";

function sheet(text: string) {
  const { table, rowNumbers } = tableFromCsv(text);
  return readProductSheet(table, rowNumbers, { maxRows: 100 });
}

describe("product import sheet", () => {
  it("reads CSV saved by Excel: BOM, ; or tab, any column order, case and spaces", () => {
    for (const separator of [",", ";", "\t"]) {
      const parsed = sheet(
        `﻿Name EN${separator}SKU${separator}Price-TK\r\nShirt${separator} ab-1 ${separator}"1,250"\r\n`,
      );
      expect(parsed.errors).toEqual([]);
      expect(parsed.columns).toEqual(["name_en", "sku", "price_tk"]);
      expect(parsed.rows[0]).toMatchObject({ row: 2, cells: { name_en: "Shirt", sku: "ab-1" } });
    }
  });

  it("warns about unknown columns and refuses duplicates, empty files and too many rows", () => {
    expect(sheet("name_en,colour_hex\nA,#fff\n").warnings[0]?.message).toContain("colour_hex");
    expect(sheet("sku,SKU\nA,B\n").errors[0]?.message).toContain("দুবার");
    expect(sheet("").errors[0]?.message).toContain("খালি");
    expect(
      sheet("hello\nx\n")
        .errors.map((issue) => issue.message)
        .join(),
    ).toContain("product_code");
    const many = `sku\n${Array.from({ length: 101 }, (_, index) => `S${index}`).join("\n")}`;
    expect(sheet(many).errors.at(-1)?.message).toContain("100");
  });

  it("flags a row split by an unquoted thousands comma", () => {
    const parsed = sheet("sku,price_tk\nA,1,250\n");
    expect(parsed.errors[0]).toMatchObject({ row: 2 });
  });

  it("keeps line breaks inside quoted cells (paragraphs, care lines)", () => {
    const parsed = sheet('name_en,description_en\nA,"One.\n\nTwo."\n');
    expect(parsed.rows[0]?.cells.description_en).toBe("One.\n\nTwo.");
  });

  it("groups rows by code, by an existing SKU, or by name and category", () => {
    const parsed = sheet(
      [
        "product_code,name_en,category_code,sku,size",
        "UEH-SH0001,Shirt,SH,,M",
        ",,,UEH-SH0001-L,L",
        ",New one,SH,,M",
        ",new  ONE,sh,,L",
        ",New one,PT,,M",
        ",,,,",
        ",,,UNKNOWN-1,M",
      ].join("\n"),
    );
    const groups = groupProducts(parsed.rows, new Map([["ueh-sh0001-l", "UEH-SH0001"]]));
    expect(groups.map((group) => [group.key, group.rows.map((row) => row.row)])).toEqual([
      ["UEH-SH0001", [2, 3]],
      ["new:new one|SH", [4, 5]],
      ["new:new one|PT", [6]],
      ["row:8", [8]],
    ]);
    expect(groups[3]?.errors[0]?.message).toContain("name_en");
  });

  it("product cells may repeat or stay empty, but may not differ", () => {
    const parsed = sheet(
      "name_en,category_code,fabric_en,size\nA,SH,Cotton,M\nA,SH,,L\nA,SH,Linen,XL\n",
    );
    const [group] = groupProducts(parsed.rows, new Map());
    expect(group?.product).toMatchObject({ name_en: "A", fabric_en: "Cotton" });
    expect(group?.errors).toHaveLength(1);
    expect(group?.errors[0]).toMatchObject({ row: 4, column: "fabric_en" });
  });

  it("parses money, numbers, lists and the clear marker", () => {
    expect(parseMoneyCell("1,250.50")).toEqual({ value: 125050 });
    expect(parseMoneyCell("১২৫০")).toEqual({ value: 125000 });
    expect(parseMoneyCell("৳ 99")).toEqual({ value: 9900 });
    expect(parseMoneyCell("Tk 10.5")).toEqual({ value: 1050 });
    expect(parseMoneyCell("12.345")).toHaveProperty("error");
    expect(parseMoneyCell("-5")).toHaveProperty("error");
    expect(parseWholeNumber("২৫০", 1000)).toEqual({ value: 250 });
    expect(parseWholeNumber("2.5", 1000)).toHaveProperty("error");
    expect(splitList(" a; b ;a;;")).toEqual(["a", "b"]);
    expect(isClear(" [CLEAR] ")).toBe(true);
    expect(hasHtml("Soft <b>cotton</b>")).toBe(true);
    expect(hasHtml("Size < 40 and > 30")).toBe(false);
    expect(headerKey("Color")).toBe("colour");
  });

  it("documents every column in both languages", () => {
    for (const column of IMPORT_COLUMNS) {
      expect(column.en.length, column.key).toBeGreaterThan(3);
      expect(column.bn.length, column.key).toBeGreaterThan(2);
    }
    expect(IMPORT_COLUMNS.filter((column) => column.requiredForNew).map((c) => c.key)).toEqual([
      "name_en",
      "category_code",
      "price_tk",
    ]);
  });
});

describe("bulk image names", () => {
  const product: ImageMatchProduct = {
    id: "p1",
    code: "UEH-SH0012",
    nameEn: "Shirt",
    status: "DRAFT",
    imageCount: 0,
    colours: [
      { id: "c-wht", code: "WHT", valueEn: "White" },
      { id: "c-nvy", code: null, valueEn: "Navy Blue" },
    ],
  };
  const products = new Map([[product.code, product]]);

  it("matches product and colour images, ignoring case and folders", () => {
    expect(matchImageName("ueh-sh0012_1.JPG", products)).toEqual({
      ok: true,
      productId: "p1",
      code: "UEH-SH0012",
      colourId: null,
      colourCode: null,
      order: 1,
    });
    expect(matchImageName("shoot/UEH-SH0012_wht_2.webp", products)).toMatchObject({
      ok: true,
      colourId: "c-wht",
      order: 2,
    });
    expect(matchImageName("UEH-SH0012_NAVYBLUE_3.png", products)).toMatchObject({
      colourId: "c-nvy",
    });
  });

  it("explains names it cannot use", () => {
    expect(matchImageName("UEH-SH0012_1.gif", products)).toMatchObject({ ok: false });
    expect(matchImageName("UEH-SH0012.jpg", products)).toMatchObject({ ok: false });
    expect(matchImageName("UEH-SH0012_0.jpg", products)).toMatchObject({ ok: false });
    expect(matchImageName("UEH-XX9999_1.jpg", products)).toMatchObject({
      reason: expect.stringContaining("UEH-XX9999"),
    });
    expect(matchImageName("UEH-SH0012_RED_1.jpg", products)).toMatchObject({
      reason: expect.stringContaining("RED"),
    });
  });

  it("finds two files for the same place", () => {
    const matches = ["UEH-SH0012_1.jpg", "ueh-sh0012_1.png", "UEH-SH0012_2.jpg"].map((name) =>
      matchImageName(name, products),
    );
    expect([...conflictingSlots(matches)]).toEqual(["p1|-|1"]);
  });
});
