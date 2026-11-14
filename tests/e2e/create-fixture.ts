import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/modules/access/password";
import { FIXTURE_FILE, type E2EFixture } from "./fixture";
import { e2eDatabaseUrl } from "./test-database";

/**
 * Run by global-setup.ts through tsx (Playwright itself cannot load the
 * ESM Prisma client).
 *
 * Creates this run's fixtures in the `_test` database: a Store Manager, an
 * Inventory Staff member (for the 403 checks) and a category with a product
 * code. Passwords are random per run and only written to the git-ignored
 * e2e-results folder.
 */

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: e2eDatabaseUrl() }),
  });
  try {
    const run = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
    const password = `e2e passphrase ${randomBytes(9).toString("base64url")}`;
    const passwordHash = await hashPassword(password);

    const role = async (name: string) =>
      (await prisma.role.findFirstOrThrow({ where: { name } })).id;
    const managerEmail = `e2e-${run}-manager@test.local`;
    const inventoryEmail = `e2e-${run}-inventory@test.local`;
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: managerEmail,
        name: "E2E Manager",
        passwordHash,
        roleId: await role("Store Manager"),
      },
    });
    const location = await prisma.location.findFirstOrThrow({ where: { isActive: true } });
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: inventoryEmail,
        name: "E2E Inventory",
        passwordHash,
        roleId: await role("Inventory Staff"),
        locationAccess: { create: { locationId: location.id } },
      },
    });

    let code = "";
    do {
      code = Array.from({ length: 4 }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      ).join("");
    } while ((await prisma.category.findFirst({ where: { code } })) !== null);
    const categoryName = `E2E Shirts ${run}`;
    await prisma.category.create({
      data: { slug: `e2e-${run}`, code, nameEn: categoryName, nameBn: "ই২ই শার্ট", sortOrder: 99 },
    });

    const fixture: E2EFixture = {
      run,
      password,
      managerEmail,
      inventoryEmail,
      categoryLabel: `${categoryName} [${code}]`,
    };
    await mkdir(join(process.cwd(), "e2e-results"), { recursive: true });
    await writeFile(FIXTURE_FILE, JSON.stringify(fixture), "utf8");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[e2e fixture] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
