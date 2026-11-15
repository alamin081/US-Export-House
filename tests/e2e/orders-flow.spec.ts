import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 9 step B-1, end to end on the order checkout.spec.ts placed (one
 * item, 10% coupon): Order Staff logs a call, swaps the item in an edit,
 * confirms, packs by scanning, ships and marks it delivered; a Store Manager
 * records the courier's cash and the order shows paid with its invoice.
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

let orderPath = "";
let orderNumber = "";

async function feedback(page: Page, text: RegExp) {
  await expect(page.getByTestId("action-feedback").filter({ hasText: text })).toBeVisible();
}

test("order staff: call, edit, confirm, pack by scanning, ship and deliver", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.orderStaffEmail);

  await page.goto(`/admin/orders?tab=new&q=${fixture!.phoneBn.slice(1)}`);
  const row = page.getByTestId("order-row");
  await expect(row).toHaveCount(1);
  await row.getByRole("link").first().click();
  await page.waitForURL(/\/admin\/orders\/[^/]+$/);
  orderPath = new URL(page.url()).pathname;
  orderNumber = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";

  // A call nobody answered.
  await page.getByTestId("call-form").locator('select[name="outcome"]').selectOption("NO_ANSWER");
  await page.getByTestId("call-form").getByRole("button", { name: "Save call" }).click();
  await feedback(page, /Call logged/);
  await expect(page.getByTestId("call-log")).toContainText("No answer");

  // On the second call the customer wants another item instead.
  await page.goto(`${orderPath}/edit`);
  await page.getByRole("button", { name: /^Remove E2E-CO-/ }).click();
  await page.getByTestId("scan-input").fill(fixture!.swapSku);
  await page.getByTestId("scan-input").press("Enter");
  await expect(page.getByTestId("edit-line").filter({ hasText: fixture!.swapSku })).toBeVisible();
  await page.getByTestId("save-order").click();
  await expect(page.getByTestId("edit-message")).toContainText("tell the customer");
  await page.goto(orderPath);
  await expect(page.getByTestId("order-items")).toContainText(fixture!.swapSku);
  await expect(page.getByTestId("order-history")).toContainText("Edited");

  await page.getByTestId("confirm-order").click();
  await expect(page.getByTestId("order-status")).toHaveText(/Confirmed/);

  await page.getByTestId("start-packing").click();
  await expect(page.getByTestId("order-status")).toHaveText(/Packing/);
  await page.getByTestId("open-pack").click();
  await page.waitForURL(/\/pack$/);
  await expect(page.getByTestId("pack-complete")).toBeDisabled();
  // A wrong item is refused and never counted.
  await page.getByTestId("scan-input").fill(fixture!.skuM);
  await page.getByTestId("scan-input").press("Enter");
  await expect(page.getByTestId("scan-signal")).toContainText("Wrong item");
  await page.getByTestId("scan-input").fill(fixture!.swapSku);
  await page.getByTestId("scan-input").press("Enter");
  await expect(page.getByTestId("pack-line")).toHaveAttribute("data-done", "true");
  await page.getByTestId("pack-complete").click();
  await page.waitForURL((url) => url.pathname === orderPath);

  await page.getByTestId("ship-form").locator('select[name="courier"]').selectOption("STEADFAST");
  await page.getByTestId("ship-form").locator('input[name="trackingCode"]').fill("SF-E2E-001");
  await page.getByTestId("ship-submit").click();
  await feedback(page, /Shipped\. Invoice INV-\d{4}-\d{5}/);
  await expect(page.getByTestId("order-status")).toHaveText(/Shipped/);
  await expect(page.getByTestId("shipment")).toContainText("SF-E2E-001");
  await expect(page.getByTestId("invoice-row")).toContainText(/INV-\d{4}-\d{5} v1/);

  await page.getByTestId("mark-delivered").click();
  await expect(page.getByTestId("order-status")).toHaveText(/Delivered/);
  await expect(page.getByTestId("payment-status")).toContainText("unpaid");
});

test("store manager records the courier's cash and the order is paid", async ({ page }) => {
  test.skip(fixture === null || orderPath === "", "previous step did not run");
  await signIn(page, fixture!.managerEmail);
  await page.goto(orderPath);
  const totalText = (await page.getByTestId("order-total").textContent()) ?? "";
  const total = totalText.replace(/[^0-9.]/g, "");

  await page.goto("/admin/orders/cod");
  const form = page.getByTestId("cod-form");
  await form.getByLabel(`Include ${orderNumber}`).check();
  await form.locator('input[name="received"]').fill(total);
  await form.getByRole("button", { name: "Record courier payment" }).click();
  await expect(page.getByTestId("cod-message")).toContainText("1 order(s) paid");
  await expect(page.getByTestId("settlements")).toContainText(orderNumber);

  await page.goto(orderPath);
  await expect(page.getByTestId("payment-status")).toContainText("· paid");
  await expect(page.getByTestId("order-history")).toContainText("Courier cash recorded");
});

test("packing slips print with the order number as a barcode", async ({ page }) => {
  test.skip(fixture === null || orderPath === "", "previous step did not run");
  await signIn(page, fixture!.orderStaffEmail);
  const orderId = orderPath.split("/").pop()!;
  await page.goto(`/admin/print/orders/packing-slips?ids=${orderId}`);
  const slip = page.getByTestId("packing-slip");
  await expect(slip).toHaveCount(1);
  await expect(slip).toContainText(orderNumber);
  await expect(slip).not.toContainText("৳");
  await expect(slip.locator(`svg[data-barcode="${orderNumber}"]`)).toHaveCount(1);
});
