/**
 * ============================================================================
 * RETIRE THE SEED PLACEHOLDER SUPER ADMIN
 * ============================================================================
 *
 * The Phase 4 seed created `admin@usexporthouse.local` without a password, as
 * a stand-in until a real Super Admin existed. Once the owner has signed in
 * with the real Super Admin, this script deactivates the placeholder.
 *
 * Usage:
 *   npm run auth:retire-placeholder              # dry run: reports, changes nothing
 *   npm run auth:retire-placeholder -- --confirm # deactivates the placeholder
 *
 * Safety:
 *   - Deactivates only. The account is never deleted, so history keeps its actor.
 *   - Refuses unless another active Super Admin with a password has actually
 *     signed in at least once (lastLogin is set) — no lock-out.
 *   - Ends any session of the placeholder and writes a `staff.deactivated`
 *     audit row, in one transaction.
 *   - Idempotent: an already inactive placeholder is reported and left alone.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { SUPER_ADMIN_ROLE } from "../src/modules/access/permissions";
import { AUDIT_ACTIONS } from "../src/modules/audit/audit-actions";

const PLACEHOLDER_EMAIL = "admin@usexporthouse.local";

function fail(message: string): never {
  console.error(`\n[retire-placeholder] ${message}\n`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    fail("DATABASE_URL is not set.");
  }
  const confirmed = process.argv.includes("--confirm");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const placeholder = await prisma.user.findFirst({
      where: { email: PLACEHOLDER_EMAIL, kind: "STAFF" },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (placeholder === null) {
      console.info(`\n[retire-placeholder] ${PLACEHOLDER_EMAIL} does not exist. Nothing to do.\n`);
      return;
    }
    if (!placeholder.isActive || placeholder.deletedAt !== null) {
      console.info(`\n[retire-placeholder] ${PLACEHOLDER_EMAIL} is already inactive.\n`);
      return;
    }

    const realAdmins = await prisma.user.findMany({
      where: {
        id: { not: placeholder.id },
        kind: "STAFF",
        isActive: true,
        deletedAt: null,
        passwordHash: { not: null },
        lastLogin: { not: null },
        role: { name: SUPER_ADMIN_ROLE, deletedAt: null },
      },
      select: { email: true },
    });
    if (realAdmins.length === 0) {
      fail(
        "No other active Super Admin has signed in yet. Run `npm run auth:bootstrap`, " +
          "sign in at /admin/login, then run this again.",
      );
    }

    const confirmedBy = realAdmins.map((admin) => admin.email).join(", ");
    if (!confirmed) {
      console.info(
        `\n[retire-placeholder] DRY RUN — nothing changed.` +
          `\n  Would deactivate: ${PLACEHOLDER_EMAIL}` +
          `\n  Super Admin(s) who have signed in: ${confirmedBy}` +
          `\n  Re-run with --confirm to apply.\n`,
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: placeholder.id }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: placeholder.id } });
      await tx.auditLog.create({
        data: {
          userId: null,
          action: AUDIT_ACTIONS.staffDeactivated,
          entityType: "user",
          entityId: placeholder.id,
          before: { email: PLACEHOLDER_EMAIL, isActive: true },
          after: { email: PLACEHOLDER_EMAIL, isActive: false, via: "retire-placeholder script" },
        },
      });
    });

    console.info(`\n[retire-placeholder] ${PLACEHOLDER_EMAIL} deactivated (not deleted).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print the error type only: the error object may hold connection details.
  console.error(
    `\n[retire-placeholder] failed: ${error instanceof Error ? error.name : "unknown error"}\n`,
  );
  process.exit(1);
});
