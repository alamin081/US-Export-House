import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { e2eDatabaseUrl } from "./test-database";

/**
 * Creates this run's fixtures in the `_test` database (see create-fixture.ts).
 * It runs under tsx because Playwright's loader cannot import the ESM Prisma
 * client directly.
 */
export default function globalSetup() {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(process.execPath, [tsxCli, join("tests", "e2e", "create-fixture.ts")], {
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`[e2e] fixture setup failed:
${result.stdout}${result.stderr}`);
  }
}
