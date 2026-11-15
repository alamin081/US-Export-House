import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { decodeEan13 } from "./ean13-decode";
import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 9 step B-3: a Branch Manager generates the missing barcode, prints the
 * label, the printed bars are decoded, and the till sells by scanning that
 * code — with a discount, a split payment (cash with change + card), a
 * receipt, and the day closed with the counted cash.
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

let scannedCode = "";

test("labels: generate the missing barcode, print it, and the printed bars decode", async ({
  page,
}) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.tillManagerEmail);
  await page.goto("/admin/labels");
  const generate = page.getByTestId("generate-barcodes");
  if ((await generate.count()) > 0) {
    await generate.click();
    await expect(
      page.getByRole("status").filter({ hasText: /barcodes generated|already/ }),
    ).toBeVisible();
  }
  await page.getByTestId("scan-input").fill(fixture!.tillSku);
  await page.getByTestId("scan-input").press("Enter");
  await expect(page.getByTestId("label-lines")).toContainText(fixture!.tillSku);
  const href = await page.getByTestId("print-labels").getAttribute("href");
  await page.goto(href!);
  const label = page.getByTestId("barcode-label").first();
  await expect(label).toContainText(fixture!.tillSku);
  const bars = await label
    .getByTestId("label-barcode")
    .locator('rect[fill="#000"]')
    .evaluateAll((rects) =>
      rects.map((rect) => ({
        x: Number(rect.getAttribute("x")),
        width: Number(rect.getAttribute("width")),
      })),
    );
  scannedCode = decodeEan13(bars);
  expect(scannedCode).toMatch(/^29\d{11}$/);
  await expect(label).toContainText(scannedCode);
});

test("till: scan the printed code, discount, split payment, receipt, close the day", async ({
  page,
}) => {
  test.skip(fixture === null || scannedCode === "", "previous step did not run");
  await signIn(page, fixture!.tillManagerEmail);
  await page.goto("/admin/pos");
  const open = page.getByTestId("open-day");
  if ((await open.count()) > 0) {
    await open.locator('input[name="openingFloat"]').fill("1000");
    await open.getByRole("button", { name: "Open the day" }).click();
  }
  const scan = page.getByTestId("till-scan");
  await expect(scan).toBeVisible();
  for (let index = 0; index < 2; index += 1) {
    await scan.fill(scannedCode);
    await scan.press("Enter");
    await expect(page.getByTestId("till-signal")).toContainText(fixture!.tillSku);
  }
  await expect(page.getByTestId("till-line")).toHaveCount(1);
  await expect(page.getByTestId("till-line")).toContainText("2");
  await page.getByTestId("bill-discount").fill("10");
  await expect(page.getByTestId("till-total")).toContainText("1,800");

  const payments = page.getByTestId("till-payments");
  await payments.getByLabel("Cash amount").fill("1000");
  await payments.getByLabel("Cash handed over").fill("1500");
  await payments.getByRole("button", { name: "Split: add a payment" }).click();
  await payments.getByLabel("Card amount").fill("800");
  await payments.getByLabel("Card reference").fill("AUTH-E2E");
  await expect(page.getByTestId("till-change")).toContainText("500");
  await page.getByTestId("complete-sale").click();
  const done = page.getByTestId("sale-done");
  await expect(done).toBeVisible();
  const bill = (await page.getByTestId("bill-number").textContent())?.trim() ?? "";
  expect(bill).toMatch(/^INV-\d{4}-\d{5,}$/);

  const receiptHref = await page.getByTestId("print-receipt").getAttribute("href");
  const dayHref = await page.getByTestId("day-link").getAttribute("href");
  await page.goto(`${receiptHref!}?lang=en`);
  await expect(page.getByTestId("receipt-bill")).toHaveText(bill);
  await expect(page.getByTestId("receipt-total")).toContainText("1,800");
  await expect(page.getByTestId("receipt-change")).toContainText("500");

  await page.goto(dayHref!);
  await expect(page.getByTestId("day-figures")).toContainText("1,800");
  const expected = ((await page.getByTestId("expected-cash").textContent()) ?? "").replace(
    /[^0-9.]/g,
    "",
  );
  await page.getByTestId("close-day").locator('input[name="countedCash"]').fill(expected);
  await page.getByTestId("close-day").getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByTestId("day-status")).toHaveText("Closed");
});
