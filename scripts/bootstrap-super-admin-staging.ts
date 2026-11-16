/**
 * ============================================================================
 * STAGING SUPER ADMIN BOOTSTRAP (one-time, interactive)
 * ============================================================================
 *
 * Creates the first Super Admin on the confirmed STAGING database only. The
 * operator types the email and the password at the prompt; the password is
 * never echoed, never a command-line argument, never read from a file and
 * never printed. It is hashed with the application's Argon2id implementation
 * (src/modules/access/password.ts) and checked against the same password policy.
 *
 * Usage (run it yourself in PowerShell, Windows Terminal or cmd):
 *   npm run auth:bootstrap:staging
 *
 * The environment comes from .env.staging only (node --env-file); .env.local
 * is never read. Every rule lives in scripts/lib/staging-bootstrap.ts.
 *
 * Writes, in one transaction and only after a typed confirmation: one STAFF
 * user with the existing "Super Admin" role, and one audit entry
 * (staff.super_admin_bootstrapped), exactly like `npm run auth:bootstrap`.
 * Roles, permissions and settings are never touched.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/access/password";
import { SUPER_ADMIN_ROLE } from "../src/modules/access/permissions";
import { AUDIT_ACTIONS } from "../src/modules/audit/audit-actions";
import {
  bootstrapStagingSuperAdmin,
  type BootstrapState,
  type BootstrapStore,
} from "./lib/staging-bootstrap";
import { ask, askHidden, isInteractiveTerminal } from "./lib/terminal-prompts";

/** Serialises concurrent bootstrap runs (pg_advisory_xact_lock key). */
const BOOTSTRAP_LOCK_KEY = 7_420_131;
const TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 60_000 } as const;

class Abort extends Error {}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function readStateWith(tx: Tx): Promise<BootstrapState> {
  const [identity] = await tx.$queryRaw<
    Array<{ projectId: string | null; branchId: string | null; database: string | null }>
  >`SELECT current_setting('neon.project_id', true) AS "projectId",
           current_setting('neon.branch_id', true)  AS "branchId",
           current_database()                       AS "database"`;
  const role = await tx.role.findUnique({
    where: { name: SUPER_ADMIN_ROLE },
    select: {
      id: true,
      name: true,
      permissions: true,
      isSystem: true,
      allLocations: true,
      deletedAt: true,
    },
  });
  // Any account holding the role counts, active or not, so a second
  // "first" Super Admin can never be bootstrapped.
  const superAdminAccounts =
    role === null ? 0 : await tx.user.count({ where: { roleId: role.id } });
  return {
    identity: identity ?? { projectId: null, branchId: null, database: null },
    role,
    superAdminAccounts,
  };
}

function prismaStore(connectionString: string): BootstrapStore {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  return {
    async readState() {
      await prisma.$connect();
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return readStateWith(tx);
      }, TRANSACTION_OPTIONS);
    },
    async isEmailTaken(email) {
      return (await prisma.user.count({ where: { email } })) > 0;
    },
    async createSuperAdmin(input, recheck) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})) AS lock`;
        const problem = recheck(await readStateWith(tx));
        if (problem !== null) throw new Abort(problem);
        if ((await tx.user.count({ where: { email: input.email } })) > 0) {
          throw new Abort("An account with that email already exists.");
        }
        const created = await tx.user.create({
          data: {
            kind: "STAFF",
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            roleId: input.roleId,
            isActive: true,
          },
          select: { id: true, email: true },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            action: AUDIT_ACTIONS.superAdminBootstrapped,
            entityType: "user",
            entityId: created.id,
            after: {
              email: created.email,
              role: SUPER_ADMIN_ROLE,
              via: "staging bootstrap script",
            },
          },
        });
        return { id: created.id, email: created.email ?? input.email };
      }, TRANSACTION_OPTIONS);
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}

async function main() {
  console.info("\n[bootstrap-staging] Staging Super Admin bootstrap\n");
  const result = await bootstrapStagingSuperAdmin({
    env: process.env,
    openStore: prismaStore,
    prompts: { isInteractive: isInteractiveTerminal(), ask, askHidden },
    hashPassword,
    log: (line) => console.info(`  ${line}`),
  });
  if (!result.ok) {
    console.error(`\n[bootstrap-staging] ${result.reason}\n`);
    process.exit(1);
  }
  console.info(`\n[bootstrap-staging] Super Admin created: ${result.email}`);
  console.info("[bootstrap-staging] Sign in at /admin/login on staging.\n");
}

main().catch((error: unknown) => {
  // Only the error type: the object may hold connection details.
  console.error(
    `\n[bootstrap-staging] failed: ${error instanceof Error ? error.name : "unknown error"}\n`,
  );
  process.exit(1);
});
