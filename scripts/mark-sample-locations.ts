/**
 * ============================================================================
 * MARK THE SEED LOCATIONS AS SAMPLE DATA (local development only)
 * ============================================================================
 *
 * The Phase 4 seed created four placeholder locations and their sample stock.
 * Phase 7 shows a "SAMPLE DATA" badge for locations flagged `isSample`; this
 * script sets that flag on those four seed codes. Approved by the owner on
 * 2026-11-14 for the local database only.
 *
 * Usage:
 *   npm run db:mark-sample              # dry run: shows what would change
 *   npm run db:mark-sample -- --confirm # sets isSample = true
 *
 * Safety:
 *   - Refuses unless APP_ENV is "local" and the database host is localhost.
 *   - Changes only the `isSample` flag of the four seed codes; nothing else.
 *   - Writes one audit row per changed location.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const SEED_LOCATION_CODES = ["WH-DHK", "BR-GUL", "BR-DHN", "BR-CTG"];

function fail(message: string): never {
  console.error(`\n[mark-sample] ${message}\n`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") fail("DATABASE_URL is not set.");
  const appEnv = process.env.APP_ENV ?? "local";
  const host = new URL(connectionString).hostname;
  if (appEnv !== "local" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    fail(`Refusing to run: APP_ENV=${appEnv}, database host ${host}. Local development only.`);
  }
  const confirmed = process.argv.includes("--confirm");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const locations = await prisma.location.findMany({
      where: { code: { in: SEED_LOCATION_CODES } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, isSample: true },
    });
    const stock = await prisma.inventoryLevel.groupBy({
      by: ["locationId"],
      where: { locationId: { in: locations.map((location) => location.id) } },
      _count: { _all: true },
      _sum: { onHand: true },
    });
    const byLocation = new Map(stock.map((row) => [row.locationId, row]));
    const pending = locations.filter((location) => !location.isSample);

    console.info(
      `\n[mark-sample] ${confirmed ? "APPLYING" : "DRY RUN"} on ${new URL(connectionString).pathname.slice(1)}`,
    );
    for (const location of locations) {
      const totals = byLocation.get(location.id);
      console.info(
        `  ${location.code.padEnd(8)} ${location.nameEn.padEnd(24)} stock rows ${String(totals?._count._all ?? 0).padStart(4)}, units ${String(totals?._sum.onHand ?? 0).padStart(5)}  ${location.isSample ? "already SAMPLE" : "-> isSample = true"}`,
      );
    }
    const missing = SEED_LOCATION_CODES.filter(
      (code) => !locations.some((location) => location.code === code),
    );
    if (missing.length > 0) console.info(`  not found (skipped): ${missing.join(", ")}`);

    if (pending.length === 0) {
      console.info("  Nothing to change.\n");
      return;
    }
    if (!confirmed) {
      console.info(
        `  ${pending.length} location(s) would be marked. Re-run with --confirm to apply.\n`,
      );
      return;
    }
    await prisma.$transaction(async (tx) => {
      for (const location of pending) {
        await tx.location.update({ where: { id: location.id }, data: { isSample: true } });
        await tx.auditLog.create({
          data: {
            action: "location.updated",
            entityType: "location",
            entityId: location.id,
            locationId: location.id,
            before: { code: location.code, isSample: false },
            after: { code: location.code, isSample: true, via: "scripts/mark-sample-locations.ts" },
          },
        });
      }
    });
    console.info(`  Marked ${pending.length} location(s) as SAMPLE DATA.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[mark-sample] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
