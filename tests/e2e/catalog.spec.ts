import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Admin to storefront, through the real UI against the `_test` database:
 * create a product -> upload an image (MOCK storage) -> publish -> it shows in
 * Bengali and English with Open Graph tags -> a price change reaches the page
 * -> archiving makes it 404. Plus the 403 checks for a read-only role.
 */

/**
 * Written by the global setup. Playwright also loads this file once to list
 * the tests, possibly before the setup ran, so a missing file is tolerated.
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
    };
  }
}

const fixture = readFixture();

// 1x1 PNG, uploaded through the admin's file input.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', fixture.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"),
  );
}

async function metaContent(page: Page, attribute: "property" | "name", key: string) {
  return page.locator(`meta[${attribute}="${key}"]`).first().getAttribute("content");
}

test.describe.configure({ mode: "serial" });

const nameEn = `E2E Navy Panjabi ${fixture.run}`;
const nameBn = "ই২ই নেভি পাঞ্জাবি";
const slug = `e2e-navy-panjabi-${fixture.run}`;
let productUrl = "";

test("a store manager creates, uploads, publishes; both storefronts show it", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await signIn(page, fixture.managerEmail);

  // --- create ---------------------------------------------------------------
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Name (English)", exact: true }).fill(nameEn);
  await page.getByRole("textbox", { name: "Name (Bengali)", exact: true }).fill(nameBn);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(slug);
  await page.locator("#categoryId").selectOption({ label: fixture.categoryLabel });

  await page.getByRole("tab", { name: /Variants/ }).click();
  await page.getByTestId("option-size-L").check();
  await page.getByTestId("option-size-M").check();
  await page.getByTestId("option-colour-NVY").check();
  await page.getByTestId("generate-variants").click();
  await expect(page.getByTestId("variant-row")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Price, row 1", exact: true }).fill("2490");
  await page.getByRole("textbox", { name: "Price, row 2", exact: true }).fill("2490");
  await page.getByRole("textbox", { name: "Compare-at price, row 1", exact: true }).fill("2990");

  // --- upload (mock storage) -------------------------------------------------
  await page.getByRole("tab", { name: /Images/ }).click();
  await expect(page.getByTestId("mock-storage-badge").first()).toBeVisible();
  await page
    .getByTestId("image-input")
    .setInputFiles({ name: "shirt.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("image-row")).toHaveCount(1);
  await expect(page.getByTestId("image-row").getByText("Main image")).toBeVisible();

  await page.getByTestId("save-product").click();
  await page.waitForURL(/\/admin\/products\/[^/]+\?saved=1$/);
  productUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId("product-status")).toHaveText("draft");

  // --- draft is not public ------------------------------------------------------
  expect((await page.request.get(`/product/${slug}`)).status()).toBe(404);

  // --- publish ------------------------------------------------------------------
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("product-status")).toHaveText("published");

  // --- Bengali storefront (default, no prefix) ------------------------------------
  await page.goto(`/product/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nameBn);
  await expect(page.getByTestId("price").first()).toHaveText("৳2,490");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn-BD");

  // Variant selection shows the SKU and the discount of that combination.
  await page.getByTestId("purchase-panel").locator("label", { hasText: "L" }).first().click();
  await expect(page.getByTestId("selected-sku")).toHaveText(/^UEH-[A-Z]{4}\d{4}-NVY-L$/);
  await expect(page.getByTestId("compare-price")).toHaveText("৳2,990");
  await expect(page.getByTestId("add-to-cart")).toBeDisabled();

  // --- English storefront, with Open Graph -------------------------------------------
  await page.goto(`/en/product/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nameEn);
  expect(await metaContent(page, "property", "og:title")).toBe(`${nameEn} — ৳2,490`);
  expect(await metaContent(page, "property", "og:image")).toMatch(
    /^http:\/\/localhost:3200\/api\/dev-uploads\/[a-f0-9]{32}\.png$/,
  );
  expect(await metaContent(page, "name", "product:price:amount")).toBe("2490.00");
  expect(await metaContent(page, "name", "product:price:currency")).toBe("BDT");
  await expect(page.locator('link[rel="alternate"][hreflang="bn-BD"]')).toHaveAttribute(
    "href",
    new RegExp(`/product/${slug}$`),
  );

  // Structured data: Product and BreadcrumbList.
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = jsonLd.map((text) => (JSON.parse(text) as { "@type": string })["@type"]);
  expect(types).toEqual(expect.arrayContaining(["Product", "BreadcrumbList"]));

  // The uploaded image is actually served.
  const image = await metaContent(page, "property", "og:image");
  expect((await page.request.get(image ?? "")).status()).toBe(200);

  // It is listed and found by search in both scripts.
  await page.goto(`/en/shop?q=${encodeURIComponent(fixture.run)}`);
  await expect(page.getByTestId("product-card")).toHaveCount(1);
  // The locale cookie from the English visit would redirect "/" to "/en".
  await page.context().clearCookies();
  await page.goto(`/shop?q=${encodeURIComponent("নেভি পাঞ্জাবি")}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "bn-BD");
  // Earlier runs may have left products with the same Bengali name; find this run's.
  await expect(page.getByTestId("product-card").locator(`a[href$="/product/${slug}"]`)).toHaveCount(
    1,
  );
  await expect(page.getByTestId("product-card").filter({ hasText: nameBn }).first()).toBeVisible();
});

test("a price change reaches the storefront page", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await signIn(page, fixture.managerEmail);

  // Warm the cache first, so the update must come from tag revalidation.
  await page.goto(`/en/product/${slug}`);
  await expect(page.getByTestId("price").first()).toHaveText("৳2,490");

  await page.goto(productUrl);
  await page.getByRole("tab", { name: /Variants/ }).click();
  await page.getByRole("textbox", { name: "Price, row 1", exact: true }).fill("1990");
  await page.getByRole("textbox", { name: "Price, row 2", exact: true }).fill("1990");
  await page.getByRole("textbox", { name: "Compare-at price, row 1", exact: true }).fill("");
  await page.getByTestId("save-product").click();
  await expect(page.getByText("No unsaved changes.")).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();

  await page.goto(`/en/product/${slug}`);
  await expect(page.getByTestId("price").first()).toHaveText("৳1,990");
  expect(await metaContent(page, "name", "product:price:amount")).toBe("1990.00");
});

test("archiving makes the product page 404 in both languages", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await signIn(page, fixture.managerEmail);
  await page.goto(productUrl);
  await page.getByTestId("archive").click();
  await expect(page.getByTestId("product-status")).toHaveText("archived");

  expect((await page.request.get(`/product/${slug}`)).status()).toBe(404);
  expect((await page.request.get(`/en/product/${slug}`)).status()).toBe(404);
  expect((await page.request.get(`/category/does-not-exist-${fixture.run}`)).status()).toBe(404);
});

test("a read-only role gets 403 from catalogue writes", async ({ page }) => {
  await signIn(page, fixture.inventoryEmail);

  const ticket = await page.request.post("/api/admin/uploads/ticket");
  expect(ticket.status()).toBe(403);

  await page.goto("/admin/products/new");
  await expect(page).toHaveURL(/\/admin\/forbidden/);

  // Reading is allowed.
  const list = await page.request.get("/api/admin/products");
  expect(list.status()).toBe(200);
});

test("anonymous visitors cannot reach the admin APIs", async ({ request }) => {
  expect((await request.get("/api/admin/products")).status()).toBe(401);
  expect((await request.post("/api/admin/uploads/ticket")).status()).toBe(401);
  expect((await request.post("/api/admin/uploads/mock")).status()).toBe(401);
});
