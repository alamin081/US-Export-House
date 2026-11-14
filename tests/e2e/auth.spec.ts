import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { FIXTURE_FILE, type E2EFixture } from "./fixture";

/**
 * Staff sign-out over real HTTP: the "Sign out" button ends the session on the
 * server, so replaying the old session cookie afterwards gets nothing.
 */

function readFixture(): Pick<E2EFixture, "password" | "managerEmail"> {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2EFixture;
  } catch {
    return { password: "", managerEmail: "" };
  }
}

const fixture = readFixture();

test("sign out revokes the session server-side, not only the cookie", async ({ page, browser }) => {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', fixture.managerEmail);
  await page.fill('input[name="password"]', fixture.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"),
  );
  const signedInCookies = await page.context().cookies();
  expect(signedInCookies.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/login");

  // The browser lost its cookie, so the admin bounces to the login page.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  // Replaying the pre-logout cookie must not work either.
  const replay = await browser.newContext();
  await replay.addCookies(signedInCookies);
  const replayPage = await replay.newPage();
  await replayPage.goto("/admin");
  await expect(replayPage).toHaveURL(/\/admin\/login/);
  await replay.close();
});
