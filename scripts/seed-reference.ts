/**
 * ============================================================================
 * REFERENCE DATA (create-only, safe in every environment)
 * ============================================================================
 *
 * Adds whatever is missing of: divisions, districts, upazilas and Dhaka
 * Metropolitan thanas; the three delivery zones; the default area-to-zone
 * mapping. Never changes or deletes an existing row, so running it again (or
 * after the admin edited zones) is harmless.
 *
 * Usage:
 *   npm run db:seed-reference
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { seedReference } from "../prisma/reference/seed-reference";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    console.error("\n[seed-reference] DATABASE_URL is not set.\n");
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await seedReference(prisma);
    console.info(
      `\n[seed-reference] added ${result.divisions} divisions, ${result.districts} districts, ` +
        `${result.upazilas} upazilas/thanas, ${result.zones} zones, ${result.mappings} zone mappings ` +
        "(existing rows untouched)\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[seed-reference] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
