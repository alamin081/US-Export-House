import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 12 step B-3: a Store Manager changes a setting on the Settings page,
 * changes a storefront label and sees it live (then clears it), and cannot
 * open role editing, which belongs to the Super Admin.
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

test("settings save with a message, and roles stay with the Super Admin", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/settings?group=store");
  const row = page.getByTestId("setting-store.whatsapp");
  const input = row.locator("input");
  const before = await input.inputValue();
  await input.fill("8801711000099");
  await page.getByTestId("save-settings").click();
  await expect(page.getByTestId("settings-message")).toHaveAttribute("role", "status");
  await expect(input).toHaveValue("8801711000099");

  // Put it back for the other specs.
  await input.fill(before);
  if (before !== "8801711000099") {
    await page.getByTestId("save-settings").click();
    await expect(page.getByTestId("settings-message")).toHaveAttribute("role", "status");
  }

  await page.goto("/admin/roles");
  await expect(page).toHaveURL(/\/admin\/forbidden\?need=role\.manage/);
});

test("a storefront label changes live and comes back when cleared", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  const label = `Where is my parcel ${fixture!.run}`.slice(0, 40);
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/content/labels");
  await page.getByTestId("label-Nav.trackOrder-en").fill(label);
  await page.getByTestId("save-label-Nav.trackOrder-en").click();
  await expect(page.getByTestId("label-message-Nav.trackOrder-en")).toHaveAttribute(
    "role",
    "status",
  );

  await page.goto("/en/shop");
  await expect(page.getByRole("link", { name: label }).first()).toBeAttached();

  await page.goto("/admin/content/labels");
  await page.getByTestId("label-Nav.trackOrder-en").fill("");
  await page.getByTestId("save-label-Nav.trackOrder-en").click();
  await expect(page.getByTestId("label-message-Nav.trackOrder-en")).toHaveAttribute(
    "role",
    "status",
  );
  await page.goto("/en/shop");
  await expect(page.getByRole("link", { name: "Track order" }).first()).toBeAttached();
});
