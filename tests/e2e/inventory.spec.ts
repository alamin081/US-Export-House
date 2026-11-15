import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 7, through the real UI against the `_test` database:
 * create a location -> CSV dry run -> apply -> the storefront says "in stock"
 * -> adjust to zero -> "out of stock" and the size button is disabled ->
 * receive by scanning, transfer create / dispatch / receive -> a branch's
 * sales staff sees only their own branch.
 */

function readFixture(): E2EFixture {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2EFixture;
  } catch {
    return {
      run: "pending",
      password: "",
      managerEmail: "",
      inventoryEmail: "",
      categoryLabel: "",
      salesEmail: "",
      branchCode: "",
      stockSlug: "",
      stockName: "",
      skuM: "",
      skuL: "",
      checkoutSlug: "",
      checkoutName: "",
      couponCode: "",
      orderStaffEmail: "",
      swapSku: "",
      tillManagerEmail: "",
      tillSku: "",
      tillBranchCode: "",
      phoneBn: "",
      phoneEn: "",
    };
  }
}

const fixture = readFixture();
const warehouseCode = `E2EW-${fixture.run
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(-8)}`;
const warehouseLabel = `${warehouseCode} · E2E Warehouse ${fixture.run}`;
const branchLabel = `${fixture.branchCode} · E2E Branch ${fixture.run}`;

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', fixture.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"),
  );
}

async function signOut(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/login");
}

/** Opens the product page (Bengali) and waits for the live stock states. */
async function openProduct(page: Page) {
  const availability = page.waitForResponse((response) =>
    response.url().includes(`/api/storefront/products/${fixture.stockSlug}/availability`),
  );
  await page.goto(`/product/${fixture.stockSlug}`);
  await availability;
}

test.describe.configure({ mode: "serial" });

let variantPath = "";

test("a manager creates the default online location and imports its opening stock from CSV", async ({
  page,
}) => {
  await signIn(page, fixture.managerEmail);

  await page.goto("/admin/locations/new");
  await page.fill('input[name="code"]', warehouseCode.toLowerCase());
  await page.fill('input[name="nameEn"]', `E2E Warehouse ${fixture.run}`);
  await page.selectOption("#location-type", "WAREHOUSE");
  await page.check('input[name="isOnlineFulfillment"]');
  // Storefront stock counts the default online location only (Phase 8).
  await page.check('input[name="isDefaultOnlineFulfillment"]');
  await page.getByTestId("save-location").click();
  await page.waitForURL(/\/admin\/locations\/(?!new)[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(warehouseCode);

  // CSV saved from Excel: BOM, semicolons, lower-case SKU, a blank row.
  const csv = `﻿location_code;sku;quantity;unit_cost_tk\r\n${warehouseCode};${fixture.skuM.toLowerCase()};5;"1,050.00"\r\n\r\n`;
  await page.goto("/admin/inventory/import");
  await page.selectOption("#import-mode", "OPENING");
  await page.setInputFiles('[data-testid="import-file"]', {
    name: "opening.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByTestId("import-preview").click();
  const table = page.getByTestId("import-preview-table");
  await expect(table).toContainText(fixture.skuM);
  await expect(table).toContainText("0 → 5");
  await expect(table).toContainText("New");
  await page.getByTestId("import-apply").click();
  await expect(page.getByTestId("import-message")).toContainText("5 units");

  await page.goto(`/admin/inventory?q=${encodeURIComponent(fixture.skuM)}`);
  const cell = page.locator(`[data-sku="${fixture.skuM}"] td[data-location="${warehouseCode}"]`);
  await expect(cell).toHaveAttribute("data-available", "5");
  variantPath = (await page.getByRole("link", { name: fixture.skuM }).getAttribute("href")) ?? "";
  expect(variantPath).toMatch(/^\/admin\/inventory\//);
});

test("the storefront shows in stock, then out of stock with the size disabled", async ({
  page,
}) => {
  await openProduct(page);
  const sizeM = page.getByTestId("size-option").filter({ hasText: "M" });
  const sizeL = page.getByTestId("size-option").filter({ hasText: "L" });
  // L has no stock anywhere: visible, struck through, not selectable.
  await expect(sizeL).toHaveAttribute("data-sold-out", "true");
  await expect(sizeL.locator("input")).toBeDisabled();
  await sizeM.click();
  await expect(page.getByTestId("stock-state")).toHaveText("স্টকে আছে");

  // Adjust the 5 units at the new location down to 0.
  await signIn(page, fixture.managerEmail);
  await page.goto(variantPath);
  await page.selectOption("#adjust-location", { label: `${warehouseCode} (available 5)` });
  await page.selectOption("#adjust-reason", "DAMAGED");
  await page.fill("#adjust-amount", "5");
  await page.getByTestId("adjust-submit").click();
  await expect(page.getByTestId("adjust-form")).toContainText("On hand is now 0");

  await openProduct(page);
  await expect(page.getByTestId("size-option").filter({ hasText: "M" })).toHaveAttribute(
    "data-sold-out",
    "true",
  );
  await expect(
    page.getByTestId("size-option").filter({ hasText: "M" }).locator("input"),
  ).toBeDisabled();

  // Still listed (links keep working), with the label; and gone from "in stock only".
  await page.goto(`/shop?q=${encodeURIComponent(fixture.stockName)}`);
  await expect(page.getByTestId("card-out-of-stock")).toHaveText("স্টক শেষ");
  await page.goto(`/shop?q=${encodeURIComponent(fixture.stockName)}&stock=in`);
  await expect(page.getByTestId("product-card")).toHaveCount(0);
});

test("stock is received by scanning, then transferred, dispatched and received", async ({
  page,
}) => {
  await signIn(page, fixture.managerEmail);

  // Receive 3 at the branch: two scans of the barcode, one typed SKU.
  await page.goto("/admin/inventory/receive");
  await page.selectOption("#receive-location", { label: branchLabel });
  const scan = page.getByTestId("scan-input");
  const barcode = `E2E${fixture.skuM.split("-")[2]}M`;
  // Back-to-back, as fast as a scanner types: nothing may be dropped.
  for (const code of [barcode, barcode, fixture.skuM.toLowerCase()]) {
    await scan.fill(code);
    await scan.press("Enter");
  }
  await expect(page.getByTestId("stock-lines")).toContainText("3 units");
  // An unknown code is refused with a clear error and never added.
  await scan.fill("NO-SUCH-CODE");
  await scan.press("Enter");
  await expect(page.getByTestId("scan-signal")).toContainText("No item");
  await expect(page.getByTestId("stock-lines")).toContainText("3 units");
  await page.getByTestId("receive-submit").click();
  await expect(page.getByRole("status").filter({ hasText: "3 units received" })).toBeVisible();

  // Transfer 2 from the branch to the online warehouse.
  await page.goto("/admin/transfers/new");
  await page.selectOption("#transfer-from", { label: branchLabel });
  await page.selectOption("#transfer-to", { label: warehouseLabel });
  await page.getByTestId("scan-input").fill(fixture.skuM);
  await page.getByTestId("scan-input").press("Enter");
  await page.getByLabel(`Quantity of ${fixture.skuM}`).fill("2");
  await page.getByTestId("transfer-save").click();
  await page.waitForURL(/\/admin\/transfers\/(?!new)[^/]+$/);
  await expect(page.getByTestId("transfer-status")).toHaveAttribute("data-status", "DRAFT");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("transfer-dispatch").click();
  await expect(page.getByTestId("transfer-status")).toHaveAttribute("data-status", "DISPATCHED");

  // In transit: counted at neither end.
  const transferUrl = page.url();
  await page.goto(`/admin/inventory?q=${encodeURIComponent(fixture.skuM)}`);
  const row = page.locator(`[data-sku="${fixture.skuM}"]`);
  await expect(row.locator(`td[data-location="${fixture.branchCode}"]`)).toHaveAttribute(
    "data-available",
    "1",
  );
  await expect(row.locator(`td[data-location="${warehouseCode}"]`)).toHaveAttribute(
    "data-available",
    "0",
  );

  await page.goto(transferUrl);
  await page.getByTestId("transfer-receive").click();
  await expect(page.getByTestId("transfer-status")).toHaveAttribute("data-status", "RECEIVED");

  await page.goto(`/admin/inventory?q=${encodeURIComponent(fixture.skuM)}`);
  await expect(
    page.locator(`[data-sku="${fixture.skuM}"] td[data-location="${warehouseCode}"]`),
  ).toHaveAttribute("data-available", "2");

  // Back in stock online: "only a few left" (2 <= 3).
  await openProduct(page);
  await page.getByTestId("size-option").filter({ hasText: "M" }).click();
  await expect(page.getByTestId("stock-state")).toHaveText("মাত্র অল্প বাকি");
  await signOut(page);
});

test("a branch's sales staff sees only their own branch", async ({ page }) => {
  await signIn(page, fixture.salesEmail);
  await page.goto(`/admin/inventory?q=${encodeURIComponent(fixture.skuM)}`);
  const headers = page.locator('[data-testid="inventory-matrix"] thead th[data-location]');
  await expect(headers).toHaveCount(1);
  await expect(headers.first()).toHaveAttribute("data-location", fixture.branchCode);
  // No cost column, no adjust, no receive for sales staff.
  await expect(page.getByText("Avg. cost")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Receive stock" })).toHaveCount(0);

  // Locations and the CSV export are scoped the same way.
  await page.goto("/admin/locations");
  await expect(page.getByTestId("locations-table")).not.toContainText(warehouseCode);
  const response = await page.request.get("/api/admin/inventory/export");
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv).toContain(`${fixture.branchCode} on_hand`);
  expect(csv).not.toContain(warehouseCode);
  expect(csv).not.toContain("unit_cost_tk");
  await signOut(page);
});
