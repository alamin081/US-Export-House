import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Phase 12 step B-2: a new hero slide goes draft → preview → publish and is
 * on the site in both languages; the menu and the About page change the same
 * way; a Content Editor cannot publish; customer accounts are hidden and no
 * form pretends to send anything.
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

async function saveAndPublish(page: Page) {
  await page.getByTestId("save-draft").click();
  await expect(page.getByTestId("editor-message")).toContainText("Draft saved");
  await expect(page.getByTestId("publish")).toBeEnabled();
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("editor-message")).toContainText("Published as version");
}

test("hero banner: draft, preview, publish — then live in Bengali and English", async ({
  page,
}) => {
  test.skip(fixture === null, "fixture missing");
  const titleEn = `Eid collection ${fixture!.run}`;
  const titleBn = `ঈদ কালেকশন ${fixture!.run}`;
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/content");
  await page.getByTestId("content-home").click();
  await page.getByTestId("add-section-hero").click();
  await page.getByTestId("hero-0-title-en").fill(titleEn);
  await page.getByTestId("hero-0-title-bn").fill(titleBn);
  await page.getByTestId("hero-0-desktop-alt-en").fill("A rail of shirts");
  await page.getByTestId("save-draft").click();
  await expect(page.getByTestId("editor-message")).toContainText("Draft saved");

  // Preview shows the draft to signed-in staff only.
  await page.goto("/api/admin/preview?key=home&locale=en");
  await expect(page.getByTestId("preview-banner")).toBeVisible();
  await expect(page.getByTestId("home-hero").filter({ hasText: titleEn })).toBeVisible();

  // The preview cookie alone (no staff session) never shows the draft.
  const cookies = await page.context().cookies();
  const bypass = cookies.filter((cookie) => cookie.name === "__prerender_bypass");
  expect(bypass).toHaveLength(1);
  await page.context().clearCookies();
  await page.context().addCookies(bypass);
  await page.goto("/en");
  await expect(page.getByTestId("preview-banner")).toHaveCount(0);
  await expect(page.getByText(titleEn)).toHaveCount(0);

  await signIn(page, fixture!.managerEmail);
  await page.goto("/api/admin/preview/exit");
  await expect(page.getByTestId("preview-banner")).toHaveCount(0);
  await expect(page.getByText(titleBn)).toHaveCount(0);

  await page.goto("/admin/content/home");
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("editor-message")).toContainText("Published as version");

  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByTestId("home-hero").filter({ hasText: titleBn })).toBeVisible();
  await page.goto("/en");
  await expect(page.getByTestId("home-hero").filter({ hasText: titleEn })).toBeVisible();
});

test("menu: a new item appears in the header after publishing", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  const label = `Sale ${fixture!.run}`;
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/content/menu.header");
  const before = await page.locator('[data-testid^="menu-item-"]').count();
  await page.getByTestId("add-menu-item").click();
  const item = page.getByTestId(`menu-item-${before}`);
  await item.locator('input[lang="en"]').first().fill(label);
  await saveAndPublish(page);
  await page.context().clearCookies();
  await page.goto("/en");
  await expect(page.locator("header nav").getByRole("link", { name: label })).toBeVisible();
});

test("About page: edit and publish", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  const text = `We have sold shirts since ${fixture!.run}.`;
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/content");
  await page.getByTestId("content-page.about").click();
  await page.getByTestId("add-block-paragraph").click();
  const blocks = page.locator('[data-testid^="block-"]');
  await blocks.last().locator('textarea[lang="en"]').fill(text);
  await saveAndPublish(page);
  await page.context().clearCookies();
  await page.goto("/en/about");
  await expect(page.getByTestId("content-page-about")).toContainText(text);
  // No Bengali written: English shows on the Bengali site too.
  await page.goto("/about");
  await expect(page.getByTestId("content-page-about")).toContainText(text);
});

test("a Content Editor can edit but not publish", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await signIn(page, fixture!.editorEmail);
  await page.goto("/admin/content/page.about");
  await expect(page.getByTestId("publish-not-allowed")).toBeVisible();
  await expect(page.getByTestId("publish")).toHaveCount(0);
  await expect(page.getByTestId("save-draft")).toBeVisible();
});

test("no customer accounts and no form that pretends to send", async ({ page }) => {
  test.skip(fixture === null, "fixture missing");
  await page.context().clearCookies();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/track-order$/);
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/track-order$/);
  await expect(page.locator('header a[href$="/account"]')).toHaveCount(0);
  await expect(page.getByTestId("site-footer").locator("form")).toHaveCount(0);
  await expect(page.getByTestId("payment-methods")).toHaveText(
    /ক্যাশ অন ডেলিভারি|Cash on delivery/,
  );

  // Publish the contact page and check it offers calls and branches, not a form.
  await signIn(page, fixture!.managerEmail);
  await page.goto("/admin/content/page.contact");
  if (await page.getByTestId("publish").isEnabled()) {
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-message")).toContainText(/Published|no changes/i);
  }
  await page.context().clearCookies();
  await page.goto("/en/contact");
  await expect(page.getByTestId("content-page-contact")).toBeVisible();
  await expect(page.locator("main form")).toHaveCount(0);
});
