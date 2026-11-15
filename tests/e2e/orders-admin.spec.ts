import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 8 admin, after checkout.spec.ts has placed this run's orders: a
 * Store Manager finds the order and opens it; Order Staff may read orders
 * but gets the "no access" page for coupons.
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
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', fixture!.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"),
  );
}

test("a store manager finds the online order and opens it", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.managerEmail);
  // The manager holds customer.read, so the phone is searchable and shown in full.
  await page.goto(`/admin/orders?q=${fixture!.phoneBn.slice(1)}`);
  const row = page.getByTestId("order-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`+88${fixture!.phoneBn}`);
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^UEH-\d{4}-\d{5}$/);
  await expect(page.getByTestId("order-phone")).toHaveText(`+88${fixture!.phoneBn}`);
  await expect(page.getByText(fixture!.couponCode)).toBeVisible();
});

test("order staff can read orders but not manage coupons", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.orderStaffEmail);
  await page.goto("/admin/orders");
  await expect(page.getByTestId("orders-table")).toBeVisible();
  await page.goto("/admin/coupons");
  await page.waitForURL(/\/admin\/forbidden/);
  await expect(page.getByRole("link", { name: "Coupons" })).toHaveCount(0);
});
