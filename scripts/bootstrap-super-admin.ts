/**
 * ============================================================================
 * ONE-TIME SUPER ADMIN BOOTSTRAP
 * ============================================================================
 *
 * Creates the first Super Admin account from environment variables, so no
 * credential is ever written into source code:
 *
 *   SUPER_ADMIN_EMAIL     defaults to admin@usexporthouse.com
 *   SUPER_ADMIN_PASSWORD  required; at least 12 characters
 *   SUPER_ADMIN_NAME      optional display name
 *
 * Usage:
 *   1. Put SUPER_ADMIN_PASSWORD in .env.local (never commit it).
 *   2. npm run auth:bootstrap
 *   3. Remove SUPER_ADMIN_PASSWORD from .env.local, then sign in at /admin/login
 *      and change the password under "My account".
 *
 * Safety:
 *   - One-time: refuses to run once any active Super Admin with a password exists.
 *   - Never prints, logs or audits the password; stores only the Argon2id hash.
 *   - Creates new records only. If the email already belongs to an account, it
 *     stops instead of modifying that account.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  checkPasswordPolicy,
  hashPassword,
  PASSWORD_PROBLEM_MESSAGES,
} from "../src/modules/access/password";
import { SUPER_ADMIN_ROLE } from "../src/modules/access/permissions";

function fail(message: string): never {
  console.error(`\n[bootstrap] ${message}\n`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    fail("DATABASE_URL is not set.");
  }

  const email = (process.env.SUPER_ADMIN_EMAIL ?? "admin@usexporthouse.com").trim().toLowerCase();
  const name = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fail("SUPER_ADMIN_EMAIL is not a valid email address.");
  }
  if (password === undefined || password === "") {
    fail("SUPER_ADMIN_PASSWORD is not set. Add it to .env.local for this one run.");
  }

  const problems = checkPasswordPolicy(password, email);
  if (problems.length > 0) {
    fail(
      `SUPER_ADMIN_PASSWORD does not meet the policy: ${problems
        .map((problem) => PASSWORD_PROBLEM_MESSAGES[problem])
        .join(" ")}`,
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const role = await prisma.role.findFirst({
      where: { name: SUPER_ADMIN_ROLE, deletedAt: null },
      select: { id: true },
    });
    if (role === null) {
      fail(`The "${SUPER_ADMIN_ROLE}" role does not exist. Run the migrations and seed first.`);
    }

    // One-time guard: an active Super Admin who can sign in already exists.
    const existingAdmins = await prisma.user.count({
      where: {
        kind: "STAFF",
        isActive: true,
        deletedAt: null,
        passwordHash: { not: null },
        roleId: role.id,
      },
    });
    if (existingAdmins > 0) {
      fail(
        "A Super Admin who can sign in already exists. This bootstrap only runs once; " +
          "create further staff from /admin/staff.",
      );
    }

    // Never modify an account that already exists.
    const sameEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (sameEmail !== null) {
      fail(
        `An account with ${email} already exists. Choose another SUPER_ADMIN_EMAIL; ` +
          "this script does not modify existing accounts.",
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { kind: "STAFF", email, name, passwordHash, roleId: role.id, isActive: true },
        select: { id: true, email: true },
      });

      await tx.auditLog.create({
        data: {
          userId: null,
          action: "staff.super_admin_bootstrapped",
          entityType: "user",
          entityId: created.id,
          after: { email: created.email, role: SUPER_ADMIN_ROLE, via: "bootstrap script" },
        },
      });

      return created;
    });

    console.info(`\n[bootstrap] Super Admin created: ${user.email}`);
    console.info("[bootstrap] Now remove SUPER_ADMIN_PASSWORD from your environment.");
    console.info("[bootstrap] Sign in at /admin/login and change the password under My account.\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print the error type only: the error object may hold connection details.
  console.error(`\n[bootstrap] failed: ${error instanceof Error ? error.name : "unknown error"}\n`);
  process.exit(1);
});
