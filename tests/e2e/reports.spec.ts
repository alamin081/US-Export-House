import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 12 step B-1: the dashboard shows real figures, a Store Manager opens
 * the sales report and downloads its CSV (UTF-8 with BOM, for Excel), and a
 * role without order access sees only the stock reports.
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

test("dashboard and sales report with a CSV download", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin");
  await expect(page.getByTestId("sales-today")).toBeVisible();
  await expect(page.getByTestId("work-queue")).toBeVisible();
  await expect(page.getByText("Sample figures")).toHaveCount(0);

  await page.goto("/admin/reports");
  await page.getByTestId("report-sales").click();
  await expect(page.getByRole("heading", { level: 1, name: "Sales summary" })).toBeVisible();
  await page.selectOption('select[name="range"]', "last_30_days");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/range=last_30_days/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("csv-periods").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^sales-periods_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const path = await download.path();
  const bytes = readFileSync(path!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.subarray(3).toString("utf8");
  expect(text.split("\r\n")[0]).toBe(
    "Day,Orders,Gross,Discount,Goods sales,Refunds,Exchange credit,Delivery returns,Net sales,Delivery income,Average order",
  );
  expect(text).toContain("Total,");

  // The streamed export of every sold order.
  const [orders] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("csv-orders").click(),
  ]);
  const ordersText = readFileSync((await orders.path())!)
    .subarray(3)
    .toString("utf8");
  expect(ordersText.split("\r\n")[0]).toMatch(/^Order,Sold at,Channel,Location/);
});

test("a role without order access sees stock reports only, without cost", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.inventoryEmail);
  await page.goto("/admin/reports");
  await expect(page.getByTestId("report-stock-value")).toBeVisible();
  await expect(page.getByTestId("report-sales")).toHaveCount(0);
  await expect(page.getByTestId("report-profit")).toHaveCount(0);
  await page.getByTestId("report-stock-value").click();
  await expect(page.getByRole("heading", { level: 1, name: "Stock value" })).toBeVisible();
  await expect(page.getByText("Value at cost")).toHaveCount(0);
  await page.goto("/admin/reports/profit");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});
