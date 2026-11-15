/**
 * ============================================================================
 * RESET THE LOCAL TEST DATABASE (us_export_house_test only)
 * ============================================================================
 *
 * Drops and recreates `us_export_house_test`, applies every migration and
 * adds the reference data. It refuses to run unless the target is exactly
 * that database on localhost / 127.0.0.1 (see lib/test-database-guard.ts):
 * the development database, a cloud database or another project's database
 * is never touched. No Docker command is run.
 *
 * Usage:
 *   npm run db:test:reset              migrations + reference data
 *   npm run db:test:reset -- --seed    also the normal seed (roles, sample
 *                                      catalogue), which the integration
 *                                      tests need — the same as CI does
 */
import { spawnSync } from "node:child_process";

import { config as loadEnvFiles } from "dotenv";
import { Client } from "pg";

import {
  checkResetTarget,
  resetStatements,
  resolveTestDatabaseUrl,
} from "./lib/test-database-guard";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n[db:test:reset] "${command} ${args.join(" ")}" failed.\n`);
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const url = resolveTestDatabaseUrl(process.env);
  const target = checkResetTarget(url);
  if (!target.ok) {
    console.error(`\n[db:test:reset] Refusing: ${target.reason}\n`);
    process.exit(1);
  }
  console.info(`\n[db:test:reset] target ${target.label}`);

  const admin = new Client({ connectionString: target.maintenanceUrl });
  await admin.connect();
  try {
    const [row] = (await admin.query<{ name: string }>("SELECT current_database() AS name")).rows;
    if (row?.name !== "postgres") throw new Error(`Connected to ${row?.name}, expected postgres.`);
    for (const statement of resetStatements(target.name)) {
      console.info(`  ${statement}`);
      await admin.query(statement);
    }
  } finally {
    await admin.end();
  }

  // Both variables point at the test database, so prisma.config.ts cannot
  // fall back to a development DATABASE_URL_UNPOOLED from .env.local.
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
  run("npx", ["prisma", "migrate", "deploy"], env);
  run("npx", ["tsx", "scripts/seed-reference.ts"], env);
  if (process.argv.includes("--seed")) run("npx", ["prisma", "db", "seed"], env);

  const check = new Client({ connectionString: url });
  await check.connect();
  try {
    const [row] = (await check.query<{ name: string }>("SELECT current_database() AS name")).rows;
    console.info(`[db:test:reset] done: ${row?.name} is migrated and seeded afresh.\n`);
  } finally {
    await check.end();
  }
}

main().catch((error: unknown) => {
  console.error("\n[db:test:reset] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
