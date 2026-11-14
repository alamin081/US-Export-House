import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./tests/e2e/test-database";

/**
 * End-to-end tests (Chromium only).
 *
 * The app is built and started against the `_test` database — never the
 * development database — into its own `.next-e2e` folder on port 3200, with
 * MOCK image storage. Browsers live in Playwright's per-user cache, outside
 * the repository.
 *
 *   npm run test:e2e
 */
const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "e2e-results/artifacts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  // A Bangladeshi visitor: Accept-Language bn-BD, so "/" stays Bengali.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], locale: "bn-BD" } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      DATABASE_URL_UNPOOLED: "",
      NEXT_DIST_DIR: ".next-e2e",
      APP_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      STORAGE_PROVIDER: "local",
      APP_ENV: "local",
    },
  },
});
