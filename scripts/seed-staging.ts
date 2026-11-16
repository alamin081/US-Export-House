/**
 * ============================================================================
 * STAGING REFERENCE SEED (roles, their permissions, default settings)
 * ============================================================================
 *
 * Seeds ONLY the confirmed staging database (see scripts/lib/staging-seed-guard.ts):
 * the seven system roles with their permission keys, and one Setting row per
 * key of the admin Settings page, holding the code default. Create-only and
 * idempotent: existing roles and settings are never changed, so running it
 * again adds nothing. It never creates users (the Super Admin comes later from
 * `npm run auth:bootstrap`), products, customers, orders or locations.
 *
 * Usage (environment comes from .env.staging only; .env.local is NOT read):
 *   npm run db:seed:staging              dry run: checks the target, prints the plan
 *   npm run db:seed:staging -- --apply   writes, in one transaction
 *
 * Safety:
 *   - refuses unless APP_ENV=staging and DATABASE_URL_UNPOOLED is the pinned
 *     staging endpoint/database over TLS (no pooler);
 *   - inside the transaction, refuses unless the server reports the pinned
 *     Neon project and branch;
 *   - never prints connection strings or passwords.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { planAccessAndSettings } from "../prisma/reference/access-and-settings";
import { checkServerIdentity, checkStagingTarget } from "./lib/staging-seed-guard";

const apply = process.argv.includes("--apply");

function fail(message: string): never {
  console.error(`\n[seed-staging] ${message}\n`);
  process.exit(1);
}

/** Never let a credential reach the console, whatever an error message contains. */
function redact(text: string, connectionString: string): string {
  let out = text.split(connectionString).join("<connection string>");
  try {
    const password = new URL(connectionString).password;
    if (password !== "") {
      out = out.split(password).join("***").split(decodeURIComponent(password)).join("***");
    }
  } catch {
    // not a URL: nothing more to hide
  }
  return out;
}

class AbortPlan extends Error {}

async function main() {
  const target = checkStagingTarget(process.env);
  if (!target.ok) fail(`Refusing to run: ${target.reason}`);

  console.info(`\n[seed-staging] target ${target.label} (${apply ? "APPLY" : "dry run"})\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: target.connectionString, max: 1 }),
  });

  try {
    // Open the connection first (wakes the compute) so the transaction starts promptly.
    await prisma.$connect();
    const result = await prisma.$transaction(
      async (tx) => {
        // A dry run cannot write, even by mistake: the database refuses it.
        if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [identity] = await tx.$queryRaw<
          Array<{ projectId: string | null; branchId: string | null; database: string | null }>
        >`SELECT current_setting('neon.project_id', true) AS "projectId",
                 current_setting('neon.branch_id', true)  AS "branchId",
                 current_database()                       AS "database"`;
        const mismatch = checkServerIdentity(
          identity ?? { projectId: null, branchId: null, database: null },
        );
        if (mismatch !== null) throw new AbortPlan(`Refusing to run: ${mismatch}`);

        const [roles, settings] = await Promise.all([
          tx.role.findMany({ select: { name: true, permissions: true, deletedAt: true } }),
          tx.setting.findMany({ select: { key: true } }),
        ]);
        const plan = planAccessAndSettings(
          roles,
          settings.map((setting) => setting.key),
        );

        if (apply) {
          if (plan.rolesToCreate.length > 0) {
            await tx.role.createMany({ data: plan.rolesToCreate, skipDuplicates: true });
          }
          if (plan.settingsToCreate.length > 0) {
            await tx.setting.createMany({ data: plan.settingsToCreate, skipDuplicates: true });
          }
        }
        return { plan, existingRoles: roles.length, existingSettings: settings.length };
      },
      // maxWait: a suspended Neon compute can take several seconds to wake up.
      { maxWait: 30_000, timeout: 60_000 },
    );

    const { plan } = result;
    console.info(`  existing roles      ${result.existingRoles}`);
    console.info(`  existing settings   ${result.existingSettings}`);
    console.info(
      `  roles ${apply ? "created" : "to create"}    ${plan.rolesToCreate.length}` +
        (plan.rolesToCreate.length > 0
          ? ` (${plan.rolesToCreate.map((role) => `${role.name}: ${role.permissions.length} permissions`).join("; ")})`
          : ""),
    );
    console.info(`  settings ${apply ? "created" : "to create"} ${plan.settingsToCreate.length}`);
    for (const warning of plan.warnings) console.warn(`  WARNING: ${warning}`);
    console.info(
      apply
        ? "\n[seed-staging] done. Existing rows were left unchanged.\n"
        : "\n[seed-staging] dry run only; nothing was written. Add -- --apply to write.\n",
    );
  } catch (error) {
    if (error instanceof AbortPlan) fail(error.message);
    const message = error instanceof Error ? error.message : String(error);
    fail(`failed, nothing was written: ${redact(message, target.connectionString)}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
