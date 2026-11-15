import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 12 step B-4: a Store Manager checks a product CSV (nothing saved),
 * applies it, downloads the export, then adds an image by file name on the
 * bulk image page and publishes the draft.
 */

function readFixture(): E2EFixture | null {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2EFixture;
  } catch {
    return null;
  }
}

const fixture = readFixture();

test.describe.configure({ mode: "serial" });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', fixture!.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"),
  );
}

const name = () => `E2E import shirt ${fixture!.run}`;

test("check a product CSV, see the preview, then apply it", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  const category = /\[([A-Z]{2,4})\]$/.exec(fixture!.categoryLabel)?.[1] ?? "";
  const csv =
    "﻿name_en,name_bn,category_code,size,colour,price_tk,status\r\n" +
    `${name()},ই২ই শার্ট,${category},M,WHT,"1,250",PUBLISHED\r\n` +
    `${name()},,${category},L,WHT,"1,250",\r\n`;

  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import products" })).toBeVisible();
  await page.setInputFiles('[data-testid="product-import-file"]', {
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByTestId("product-import-check").click();
  await page.waitForURL(/\/admin\/products\/import\/[a-z0-9]+$/);
  const summary = page.getByTestId("import-summary");
  await expect(summary).toContainText("New products1");
  await expect(summary).toContainText("Errors0");
  // Asked to publish, but it has no image yet: a warning, it stays a draft.
  await page.getByRole("tab", { name: /Warnings/ }).click();
  await expect(page.getByText(/ছবি নেই/)).toBeVisible();

  await page.getByTestId("import-apply-button").click();
  await expect(page.getByTestId("import-apply-message")).toContainText("Import finished.");
  await expect(page.getByTestId("import-status")).toHaveText("DONE");

  await page.goto(`/admin/products?q=${encodeURIComponent(name())}`);
  await expect(page.getByText(name())).toBeVisible();
});

test("export the filtered list in the import's columns", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.managerEmail);
  await page.goto(`/admin/products?q=${encodeURIComponent(name())}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("products-export").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^products_\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).trim().split("\r\n");
  expect(lines[0]).toMatch(/^product_code,name_en,name_bn,/);
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain(name());
});

test("bulk images by file name, then publish the draft", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.managerEmail);
  await page.goto(`/admin/products?q=${encodeURIComponent(name())}`);
  const code = /UEH-[A-Z]{2,4}\d{4,}/.exec(await page.locator("main").innerText())?.[0];
  expect(code).toBeDefined();

  await page.goto("/admin/products/images");
  await page.setInputFiles('[data-testid="bulk-images-files"]', [
    { name: `${code!.toLowerCase()}_1.png`, mimeType: "image/png", buffer: PNG },
    { name: `${code}_WHT_2.png`, mimeType: "image/png", buffer: PNG },
    { name: "holiday.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(page.getByTestId("bulk-images-table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("bulk-images-unmatched")).toContainText("holiday.png");

  await page.getByTestId("bulk-images-upload").click();
  await expect(page.getByTestId("bulk-images-message")).toContainText("All images saved.");
  const publish = page.getByTestId("bulk-images-publish");
  await expect(publish).toContainText(code!);
  await expect(publish).toContainText("import asked to publish");
  await publish.getByRole("button", { name: /Publish 1 product/ }).click();
  await expect(page.getByTestId("bulk-images-message")).toContainText("Updated 1 product");
});
