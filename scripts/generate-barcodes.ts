/**
 * ============================================================================
 * GENERATE MISSING BARCODES (local development database)
 * ============================================================================
 *
 * Gives every variant without a barcode the shop's own EAN-13 (29 + running
 * number + check digit). Existing barcodes are never changed. Approved by the
 * owner on 2026-11-15 for the local database (245 variants); on staging and
 * production the same job is the "Generate missing barcodes" button on the
 * Labels page (audited per staff member).
 *
 * Usage:
 *   npm run catalog:generate-barcodes              # dry run: shows what would change
 *   npm run catalog:generate-barcodes -- --confirm # writes the barcodes
 *
 * Safety:
 *   - Refuses unless APP_ENV is "local" and the database host is localhost.
 *   - Only fills empty barcodes (`WHERE barcode IS NULL`), one transaction.
 *   - Writes one audit row listing every SKU and its new barcode.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { internalEan13 } from "../src/modules/labels/barcode";

function fail(message: string): never {
  console.error(`\n[barcodes] ${message}\n`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") fail("DATABASE_URL is not set.");
  const appEnv = process.env.APP_ENV ?? "local";
  const url = new URL(connectionString);
  if (appEnv !== "local" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    fail("Local database only. On staging/production use Labels → Generate missing barcodes.");
  }
  const confirm = process.argv.includes("--confirm");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const variants = await prisma.productVariant.findMany({
      where: { barcode: null, deletedAt: null },
      select: { id: true, sku: true },
      orderBy: { createdAt: "asc" },
    });
    const total = await prisma.productVariant.count();
    console.info(
      `[barcodes] database ${url.pathname.slice(1)}: ${variants.length} of ${total} variants have no barcode.`,
    );
    if (variants.length === 0) return;
    if (!confirm) {
      for (const variant of variants.slice(0, 10)) console.info(`  would set ${variant.sku}`);
      if (variants.length > 10) console.info(`  … and ${variants.length - 10} more`);
      console.info(
        "\n[barcodes] Dry run: nothing changed. Run again with -- --confirm to write.\n",
      );
      return;
    }
    const assigned = await prisma.$transaction(
      async (tx) => {
        const done: string[] = [];
        for (const variant of variants) {
          let code = "";
          for (let attempt = 0; attempt < 50 && code === ""; attempt += 1) {
            const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`
              SELECT nextval('barcode_seq') AS value`;
            const candidate = internalEan13(Number(row?.value ?? 0));
            const taken = await tx.productVariant.findUnique({
              where: { barcode: candidate },
              select: { id: true },
            });
            if (taken === null) code = candidate;
          }
          if (code === "") throw new Error("No free barcode found.");
          const updated = await tx.productVariant.updateMany({
            where: { id: variant.id, barcode: null },
            data: { barcode: code },
          });
          if (updated.count === 1) done.push(`${variant.sku}=${code}`);
        }
        await tx.auditLog.create({
          data: {
            id: `script_${randomUUID()}`,
            action: "catalog.barcodes_generated",
            entityType: "ProductVariant",
            before: { barcode: null },
            after: { count: done.length, variants: done, via: "scripts/generate-barcodes.ts" },
          },
        });
        return done;
      },
      { timeout: 120_000 },
    );
    console.info(
      `[barcodes] ${assigned.length} barcodes written, e.g. ${assigned.slice(0, 3).join(", ")}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
