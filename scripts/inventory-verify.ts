/**
 * ============================================================================
 * INVENTORY LEDGER CHECK (read-only)
 * ============================================================================
 *
 * Proves that every stock number can be explained by the ledger:
 *   onHand = sum of movements (except RESERVE / RELEASE)
 *   reserved = sum of RESERVE / RELEASE
 * plus orphan ledger rows and transfer totals. It only runs SELECTs.
 *
 * Usage:
 *   npm run inventory:verify
 *
 * Exit code 0 when everything matches, 1 on any mismatch.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { findLedgerMismatches } from "../src/modules/inventory/ledger-check.repository";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    console.error("\n[inventory:verify] DATABASE_URL is not set.\n");
    process.exit(1);
  }
  const database = new URL(connectionString).pathname.replace(/^\//, "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await findLedgerMismatches(prisma);
    console.info(`\n[inventory:verify] database ${database}`);
    console.info(
      `  checked ${result.levelsChecked} stock rows, ${result.movementsChecked} movements, ${result.transfersChecked} transfers`,
    );
    if (result.mismatches.length === 0) {
      console.info("  OK: every stock row equals its ledger.\n");
      return;
    }
    console.error(`  ${result.mismatches.length} mismatch(es):`);
    for (const mismatch of result.mismatches)
      console.error(`   - [${mismatch.check}] ${mismatch.detail}`);
    console.error("");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[inventory:verify] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
