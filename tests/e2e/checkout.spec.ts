import { readFileSync } from "node:fs";

import { devices, expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 8, on a phone, against the `_test` database: product -> cart ->
 * checkout (the zone follows the address: Dhaka city, Dhaka's own upazilas
 * and Gazipur) -> coupon -> cash-on-delivery order -> confirmation ->
 * tracking. Once in Bengali (the default) and once in English.
 */

function readFixture(): E2EFixture | null {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2EFixture;
  } catch {
    return null;
  }
}

const fixture = readFixture();
const { defaultBrowserType: _browser, ...pixel } = devices["Pixel 7"];

test.use({ ...pixel });
test.describe.configure({ mode: "serial" });

async function addToCart(page: Page, prefix: string) {
  const availability = page.waitForResponse((response) =>
    response.url().includes(`/api/storefront/products/${fixture!.checkoutSlug}/availability`),
  );
  await page.goto(`${prefix}/product/${fixture!.checkoutSlug}`);
  await availability;
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("added-to-cart")).toBeVisible();
  await expect(page.getByTestId("header-cart")).toHaveAttribute("data-units", "1");
  await page.getByTestId("view-cart").click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.getByTestId("proceed-to-checkout").click();
  await expect(page.getByTestId("checkout-form")).toBeVisible();
}

async function chooseArea(page: Page, division: string, district: string, upazila: string) {
  await page.selectOption("#division", { label: division });
  await expect(page.locator(`#district option[value="${district}"]`)).toHaveCount(1);
  await page.selectOption("#district", district);
  await expect(page.locator(`#upazila option[value="${upazila}"]`)).toHaveCount(1);
  await page.selectOption("#upazila", upazila);
}

async function firstUpazila(page: Page) {
  await expect(page.locator("#upazila option")).not.toHaveCount(1);
  return (await page.locator("#upazila option").nth(1).getAttribute("value")) ?? "";
}

test("Bengali: order with a coupon from a phone, then track it", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await addToCart(page, "");

  await page.fill("#name", "ই২ই ক্রেতা");
  await page.fill("#phone", fixture!.phoneBn);

  // Dhaka district's own upazila -> around Dhaka.
  await chooseArea(page, "ঢাকা", "dist-47", "upz-365");
  await expect(page.getByTestId("delivery-zone")).toHaveAttribute("data-zone", "dhaka_suburbs");
  // Gazipur district -> around Dhaka.
  await page.selectOption("#district", "dist-41");
  await page.selectOption("#upazila", await firstUpazila(page));
  await expect(page.getByTestId("delivery-zone")).toHaveAttribute("data-zone", "dhaka_suburbs");
  // A Dhaka metropolitan thana -> Dhaka city.
  await page.selectOption("#district", "dist-47");
  await expect(page.locator('#upazila option[value="dhk-metro-13"]')).toHaveCount(1);
  await page.selectOption("#upazila", "dhk-metro-13");
  await expect(page.getByTestId("delivery-zone")).toHaveAttribute("data-zone", "inside_dhaka");

  await page.fill("#street", "বাসা ১২, রোড ৫, ধানমন্ডি");
  await page.fill("#coupon", fixture!.couponCode.toLowerCase());
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("coupon-message")).toContainText(fixture!.couponCode);
  // ৳1,200 - 10% = ৳1,080, plus the city rate.
  await expect(page.getByTestId("summary-discount")).toContainText("120");

  await page.waitForTimeout(3_500); // the minimum fill time
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]+$/);
  const orderNumber = (await page.getByTestId("order-number").textContent())?.trim() ?? "";
  expect(orderNumber).toMatch(/^UEH-\d{4}-\d{5}$/);
  await expect(page.getByTestId("order-details")).toHaveAttribute("data-status", "PENDING");
  await expect(page.getByTestId("header-cart")).toHaveAttribute("data-units", "0");

  // Tracking: the right phone shows it, a wrong one gets the generic answer.
  await page.goto("/track-order");
  await page.fill("#orderNumber", orderNumber.toLowerCase());
  await page.fill("#trackPhone", fixture!.phoneBn);
  await page.locator('[data-testid="track-form"] button[type="submit"]').click();
  await expect(page.getByTestId("track-order-number")).toContainText(orderNumber);
  await page.fill("#trackPhone", "01999999999");
  await page.locator('[data-testid="track-form"] button[type="submit"]').click();
  await expect(page.getByTestId("track-error")).toBeVisible();
});

test("English: order without a coupon, delivery outside Dhaka", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await addToCart(page, "/en");

  await page.fill("#name", "E2E Customer");
  await page.fill("#phone", fixture!.phoneEn);
  await page.selectOption("#division", { label: "Chattogram" });
  await expect(page.locator("#district option")).not.toHaveCount(1);
  await page.selectOption("#district", { index: 1 });
  await page.selectOption("#upazila", await firstUpazila(page));
  await expect(page.getByTestId("delivery-zone")).toHaveAttribute("data-zone", "outside_dhaka");
  await page.fill("#street", "House 3, Road 1, Agrabad");

  await page.waitForTimeout(3_500);
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/en\/order\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
});
