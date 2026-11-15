import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { PERMISSIONS, type PermissionKey } from "@/modules/access/permissions";
import { exportColumns, productExportPages } from "@/modules/catalog/import/product-export.service";
import { attachBulkImages } from "@/modules/catalog/import/product-images.service";
import {
  applyImportChunk,
  applyProductImport,
  checkProductImport,
  getImportPreview,
  importErrorsCsv,
  importTemplateCsv,
} from "@/modules/catalog/import/product-import.service";
import { issueUploadToken } from "@/modules/media/media.service";
import { csvField, csvLine, CSV_BOM } from "@/modules/reports/report-csv";
import { caught, runId, staffFor, testMeta } from "./order-fixture";

/**
 * Phase 12 B-4 against the test database: check (dry run) → preview →
 * apply, all-or-nothing and good-only, permissions, the optimistic lock,
 * duplicate files, cost, Excel files, the export round trip and bulk images.
 */

const RUN = runId();
const meta = testMeta;
/** A free 4-letter category code, chosen in beforeAll. */
let CAT = "";
let owner: StaffContext;
let categoryId: string;

const HEAD = [
  "product_code",
  "name_en",
  "name_bn",
  "category_code",
  "size",
  "colour",
  "sku",
  "price_tk",
  "compare_at_tk",
  "cost_tk",
  "status",
];

function csv(rows: Array<Record<string, string>>, headers = HEAD): Uint8Array {
  const lines = [csvLine(headers.map((header) => csvField(header)))];
  for (const row of rows) lines.push(csvLine(headers.map((header) => csvField(row[header] ?? ""))));
  return new TextEncoder().encode(CSV_BOM + lines.join(""));
}

function staffWith(base: StaffContext, without: PermissionKey[]): StaffContext {
  return { ...base, permissions: base.permissions.filter((key) => !without.includes(key)) };
}

async function check(staff: StaffContext, bytes: Uint8Array, fileName = `p-${RUN}.csv`) {
  const created = await checkProductImport(staff, { fileName, bytes }, meta());
  return getImportPreview(staff, created.id);
}

function shirtRows(name: string, extra: Record<string, string> = {}) {
  const rows: Array<Record<string, string>> = [];
  for (const colour of ["WHT", "BLK"]) {
    for (const size of ["M", "L"]) {
      rows.push({
        name_en: name,
        name_bn: "শার্ট",
        category_code: CAT,
        size,
        colour,
        price_tk: "1,250",
        ...extra,
      });
    }
  }
  return rows;
}

beforeAll(async () => {
  owner = await staffFor(RUN, "Super Admin", { permissions: [...PERMISSIONS] });
  do {
    CAT = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("");
  } while ((await db.category.findFirst({ where: { code: CAT } })) !== null);
  const category = await db.category.create({
    data: { slug: `import-${RUN.toLowerCase()}`, code: CAT, nameEn: `Import ${RUN}` },
  });
  categoryId = category.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("check and apply (all or nothing)", () => {
  it("creates a product with its variants, and changes nothing before apply", async () => {
    const preview = await check(owner, csv(shirtRows(`Import shirt ${RUN}`)));
    expect(preview.counts).toMatchObject({ create: 1, update: 0, error: 0, rows: 4 });
    expect(await db.product.count({ where: { nameEn: `Import shirt ${RUN}` } })).toBe(0);

    const result = await applyProductImport(owner, preview.id, { confirmDuplicate: false }, meta());
    expect(result.applied).toBe(1);
    const product = await db.product.findFirstOrThrow({
      where: { nameEn: `Import shirt ${RUN}` },
      include: { variants: true },
    });
    expect(product.status).toBe("DRAFT");
    expect(product.categoryId).toBe(categoryId);
    expect(product.code).toMatch(new RegExp(`^UEH-${CAT}\\d{4}$`));
    expect(product.variants).toHaveLength(4);
    expect(product.variants.every((variant) => variant.pricePoisha === 125000)).toBe(true);
    expect(product.variants.every((variant) => variant.barcode?.length === 13)).toBe(true);
    expect(product.variants.map((variant) => variant.sku).sort()).toEqual(
      [
        `${product.code}-BLK-L`,
        `${product.code}-BLK-M`,
        `${product.code}-WHT-L`,
        `${product.code}-WHT-M`,
      ].sort(),
    );
    const audits = await db.auditLog.findMany({
      where: { entityId: product.id },
      select: { action: true },
    });
    expect(audits.map((row) => row.action)).toContain("catalog.product.import");
    // Applying twice is refused.
    expect(
      (await caught(applyProductImport(owner, preview.id, { confirmDuplicate: false }, meta())))
        .code,
    ).toBe("CONFLICT");
  });

  it("updates through the SKU alone, shows the difference, and leaves the rest", async () => {
    const product = await db.product.findFirstOrThrow({ where: { nameEn: `Import shirt ${RUN}` } });
    const sku = `${product.code}-WHT-M`;
    const preview = await check(
      owner,
      csv([{ sku, price_tk: "1,300.50", name_bn: "নতুন শার্ট" }], ["sku", "price_tk", "name_bn"]),
    );
    expect(preview.counts).toMatchObject({ update: 1, error: 0 });
    const diff = preview.rows[0]!.diff;
    expect(diff).toEqual(
      expect.arrayContaining([
        { field: "name_bn", sku: null, before: "শার্ট", after: "নতুন শার্ট" },
        { field: "price_tk", sku, before: "1250", after: "1300.50" },
      ]),
    );
    await applyProductImport(owner, preview.id, { confirmDuplicate: false }, meta());
    const after = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    });
    expect(after.nameBn).toBe("নতুন শার্ট");
    expect(after.nameEn).toBe(product.nameEn);
    expect(after.variants.find((variant) => variant.sku === sku)?.pricePoisha).toBe(130050);
    expect(after.variants.filter((variant) => variant.pricePoisha === 125000)).toHaveLength(3);
    const priceAudit = await db.auditLog.findFirstOrThrow({
      where: { entityId: product.id, action: "catalog.price.import" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(priceAudit.before)).toContain("125000");
    expect(JSON.stringify(priceAudit.after)).toContain("130050");
  });

  it("refuses a row the staff member may not change, with the reason", async () => {
    const product = await db.product.findFirstOrThrow({ where: { nameEn: `Import shirt ${RUN}` } });
    const noPrice = staffWith(owner, ["catalog.price.write"]);
    const preview = await check(
      noPrice,
      csv([{ sku: `${product.code}-BLK-M`, price_tk: "999" }], ["sku", "price_tk"]),
    );
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[0]!.errors[0]!.message).toContain("catalog.price.write");
    expect(
      (await caught(applyProductImport(noPrice, preview.id, { confirmDuplicate: false }, meta())))
        .code,
    ).toBe("VALIDATION_FAILED");
    expect((await caught(check(staffWith(owner, ["catalog.import"]), csv([])))).code).toBe(
      "FORBIDDEN",
    );
  });

  it("explains every problem by row and column, and offers them as CSV", async () => {
    const rows: Array<Record<string, string>> = [
      { name_en: `Bad ${RUN}`, category_code: CAT, size: "M", colour: "PURPLEX", price_tk: "10" },
      { name_en: `Bad ${RUN}`, category_code: CAT, size: "L", colour: "WHT", price_tk: "abc" },
      { name_en: `Bad ${RUN}`, category_code: "ZZZZ", size: "XL", colour: "WHT", price_tk: "10" },
      { name_en: `Twice ${RUN}`, category_code: CAT, size: "M", colour: "WHT", price_tk: "10" },
      { name_en: `Twice ${RUN}`, category_code: CAT, size: "M", colour: "WHT", price_tk: "10" },
      { name_en: `<b>Html</b> ${RUN}`, category_code: CAT, price_tk: "10" },
      { product_code: "EXAMPLE-SH0001", name_en: "Example", category_code: "SH", price_tk: "1" },
    ];
    const preview = await check(owner, csv(rows));
    // "Bad" with another category is a product of its own: 5 products.
    expect(preview.counts.error).toBe(5);
    const messages = preview.rows.flatMap((row) =>
      row.errors.map((issue) => `${issue.row}:${issue.column}:${issue.message}`),
    );
    expect(messages.join("\n")).toMatch(/2:colour:.*PURPLEX/);
    expect(messages.join("\n")).toMatch(/3:price_tk:/);
    expect(messages.join("\n")).toMatch(/4:category_code:/);
    expect(messages.join("\n")).toMatch(/6:size:.*দুবার/);
    expect(messages.join("\n")).toMatch(/name_en:.*HTML/);
    expect(messages.join("\n")).toMatch(/উদাহরণ/);
    const errorsCsv = await importErrorsCsv(owner, preview.id);
    expect(errorsCsv.charCodeAt(0)).toBe(0xfeff);
    expect(errorsCsv.split("\r\n")[0]).toMatch(/,error$/);
    expect(errorsCsv).toContain("PURPLEX");
  });

  it("the template's examples are refused", async () => {
    const preview = await check(owner, new TextEncoder().encode(importTemplateCsv()));
    expect(preview.counts.create + preview.counts.update).toBe(0);
    expect(preview.counts.error).toBeGreaterThan(0);
  });

  it("skips nothing silently: a product edited after the check stops the whole file", async () => {
    const product = await db.product.findFirstOrThrow({ where: { nameEn: `Import shirt ${RUN}` } });
    const preview = await check(
      owner,
      csv(
        [
          { sku: `${product.code}-BLK-L`, price_tk: "1,111" },
          ...shirtRows(`Locked new ${RUN}`).map((row) => ({ ...row, sku: "" })),
        ],
        [...HEAD],
      ),
    );
    expect(preview.counts).toMatchObject({ create: 1, update: 1, error: 0 });
    await db.product.update({ where: { id: product.id }, data: { version: { increment: 1 } } });
    const failure = await caught(
      applyProductImport(owner, preview.id, { confirmDuplicate: false }, meta()),
    );
    expect(failure.code).toBe("CONFLICT");
    expect(failure.message).toContain("এডিট হয়েছে");
    expect(await db.product.count({ where: { nameEn: `Locked new ${RUN}` } })).toBe(0);
    expect((await db.productImport.findUniqueOrThrow({ where: { id: preview.id } })).status).toBe(
      "FAILED",
    );
  });

  it("asks before importing the same file twice", async () => {
    const bytes = csv(shirtRows(`Twice file ${RUN}`));
    const first = await check(owner, bytes, `same-${RUN}.csv`);
    await applyProductImport(owner, first.id, { confirmDuplicate: false }, meta());
    const second = await check(owner, bytes, `same-${RUN}.csv`);
    expect(second.duplicate).not.toBeNull();
    expect(second.counts.create).toBe(1);
    const refused = await caught(
      applyProductImport(owner, second.id, { confirmDuplicate: false }, meta()),
    );
    expect(refused.code).toBe("CONFLICT");
    expect((await db.productImport.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      "VALIDATED",
    );
  });
});

describe("cost", () => {
  it("is ignored without cost permission and set as the opening cost with it", async () => {
    const rows = shirtRows(`Cost shirt ${RUN}`, { cost_tk: "600" });
    const noCost = staffWith(owner, ["inventory.cost.read"]);
    const blind = await check(noCost, csv(rows));
    expect(blind.includeCost).toBe(false);
    expect(blind.fileWarnings.map((issue) => issue.message).join()).toContain("cost_tk");

    const preview = await check(owner, csv(rows));
    expect(JSON.stringify(preview.rows)).not.toContain("60000");
    await applyProductImport(owner, preview.id, { confirmDuplicate: true }, meta());
    const variants = await db.productVariant.findMany({
      where: { product: { nameEn: `Cost shirt ${RUN}` } },
    });
    expect(variants).toHaveLength(4);
    expect(variants.every((variant) => variant.costPoisha === 60000)).toBe(true);
  });
});

describe("Excel and the export round trip", () => {
  function xlsx(table: string[][]): Uint8Array {
    const cell = (value: string, column: number, row: number) =>
      `<c r="${String.fromCharCode(65 + column)}${row}" t="inlineStr"><is><t xml:space="preserve">${value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</t></is></c>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${table
      .map(
        (cells, row) =>
          `<row r="${row + 1}">${cells.map((value, column) => cell(value, column, row + 1)).join("")}</row>`,
      )
      .join("")}</sheetData></worksheet>`;
    return zipSync({
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    });
  }

  it("reads the first sheet of an .xlsx with the same rules", async () => {
    const table = [
      ["name_en", "category_code", "size", "colour", "price_tk"],
      [`Excel shirt ${RUN}`, CAT, "M", "Navy Blue", "১৫০০"],
      [`Excel shirt ${RUN}`, CAT, "L", "nvy", "1500"],
    ];
    const preview = await check(owner, xlsx(table), `p-${RUN}.xlsx`);
    expect(preview.fileKind).toBe("xlsx");
    expect(preview.counts).toMatchObject({ create: 1, error: 0, rows: 2 });
    await applyProductImport(owner, preview.id, { confirmDuplicate: false }, meta());
    const variants = await db.productVariant.findMany({
      where: { product: { nameEn: `Excel shirt ${RUN}` } },
    });
    expect(variants.map((variant) => variant.pricePoisha)).toEqual([150000, 150000]);
  });

  it("exports what the import reads: re-importing the export changes nothing", async () => {
    const pages: Array<Record<string, string>> = [];
    for await (const page of productExportPages(owner, { q: RUN })) pages.push(...page);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const headers = exportColumns(owner).map((column) => column.header);
    expect(headers).toContain("cost_tk");
    expect(
      exportColumns(staffWith(owner, ["inventory.cost.read"])).map((c) => c.header),
    ).not.toContain("cost_tk");
    const lines = [csvLine(headers.map((header) => csvField(header)))];
    for (const row of pages)
      lines.push(csvLine(headers.map((header) => csvField(row[header] ?? ""))));
    const preview = await check(owner, new TextEncoder().encode(CSV_BOM + lines.join("")));
    expect(preview.counts.error).toBe(0);
    expect(preview.counts.create + preview.counts.update).toBe(0);
    expect(preview.counts.unchanged).toBeGreaterThanOrEqual(3);
    await expect(
      productExportPages(staffWith(owner, ["catalog.export"]), {}).next(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("good products only", () => {
  it("saves the good products in chunks and skips the rest, when allowed", async () => {
    const rows = [
      ...shirtRows(`Partial good ${RUN}`),
      {
        name_en: `Partial bad ${RUN}`,
        category_code: CAT,
        size: "M",
        colour: "NOPE",
        price_tk: "10",
      },
    ];
    const preview = await check(owner, csv(rows));
    expect(preview.counts).toMatchObject({ create: 1, error: 1 });
    expect(
      (await caught(applyImportChunk(owner, preview.id, { confirmDuplicate: false }, meta()))).code,
    ).toBe("FORBIDDEN");
    await db.setting.upsert({
      where: { key: "catalog.import.allowPartial" },
      update: { value: "true" },
      create: { key: "catalog.import.allowPartial", value: "true" },
    });
    try {
      const result = await applyImportChunk(owner, preview.id, { confirmDuplicate: false }, meta());
      expect(result.done).toBe(true);
      expect(result.totals.applied).toBe(1);
      expect(await db.product.count({ where: { nameEn: `Partial good ${RUN}` } })).toBe(1);
      expect(await db.product.count({ where: { nameEn: `Partial bad ${RUN}` } })).toBe(0);
      expect(
        (await db.productImport.findUniqueOrThrow({ where: { id: preview.id } })).skippedCount,
      ).toBe(1);
    } finally {
      await db.setting.update({
        where: { key: "catalog.import.allowPartial" },
        data: { value: "false" },
      });
    }
  });
});

describe("bulk images", () => {
  function upload(name: string) {
    const image = {
      provider: "local-mock" as const,
      key: `bulk/${RUN}/${name}`,
      url: `/api/dev-uploads/${RUN}-${name}`,
      width: 800,
      height: 1000,
      bytes: 1234,
      format: "jpg",
    };
    return { ...image, token: issueUploadToken(image) };
  }

  it("adds or replaces images, checks colours and uploads, and reports when a draft can be published", async () => {
    const product = await db.product.findFirstOrThrow({
      where: { nameEn: `Import shirt ${RUN}` },
      include: { options: { include: { values: true } } },
    });
    const white = product.options
      .flatMap((option) => option.values)
      .find((value) => value.code === "WHT")!;
    const first = await attachBulkImages(
      owner,
      {
        productId: product.id,
        mode: "add",
        images: [
          { upload: upload("a.jpg"), colourId: null, order: 1 },
          { upload: upload("b.jpg"), colourId: white.id, order: 2 },
        ],
      },
      meta(),
    );
    expect(first.imageCount).toBe(2);
    expect(first.publishable).toBe(true);
    const replaced = await attachBulkImages(
      owner,
      {
        productId: product.id,
        mode: "replace",
        images: [{ upload: upload("c.jpg"), colourId: null, order: 1 }],
      },
      meta(),
    );
    expect(replaced.imageCount).toBe(1);
    const forged = { ...upload("d.jpg"), url: "https://evil.example/x.jpg" };
    expect(
      (
        await caught(
          attachBulkImages(
            owner,
            {
              productId: product.id,
              mode: "add",
              images: [{ upload: forged, colourId: null, order: 1 }],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await caught(
          attachBulkImages(
            owner,
            {
              productId: product.id,
              mode: "add",
              images: [{ upload: upload("e.jpg"), colourId: "nope", order: 1 }],
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await caught(
          attachBulkImages(
            staffWith(owner, ["catalog.write"]),
            { productId: product.id, mode: "add", images: [] },
            meta(),
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
    expect(
      await db.auditLog.count({ where: { entityId: product.id, action: "catalog.images.bulk" } }),
    ).toBe(2);
  });
});
