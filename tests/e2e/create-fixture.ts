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
    // Phase 12: edits content but may not publish it.
    const editorEmail = `e2e-${run}-editor@test.local`;
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: editorEmail,
        name: "E2E Content Editor",
        passwordHash,
        roleId: await role("Content Editor"),
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

    // Phase 7: a branch with its own sales staff, and a published product
    // (sizes M and L, no stock anywhere yet) for the stock flow.
    const tag = run
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(-8);
    const branchCode = `E2EB-${tag}`;
    const branch = await prisma.location.create({
      data: { code: branchCode, type: "BRANCH", nameEn: `E2E Branch ${run}`, isActive: true },
    });
    const salesEmail = `e2e-${run}-sales@test.local`;
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: salesEmail,
        name: "E2E Sales",
        passwordHash,
        roleId: await role("Branch Sales Staff"),
        locationAccess: { create: { locationId: branch.id } },
      },
    });
    const stockSlug = `e2e-stock-${run}`;
    // Named by the short tag, not the run id: catalog.spec searches by run id.
    const stockName = `E2E Stock Shirt ${tag}`;
    const skuM = `E2E-STK-${tag}-M`;
    const skuL = `E2E-STK-${tag}-L`;
    const product = await prisma.product.create({
      data: {
        slug: stockSlug,
        nameEn: stockName,
        nameBn: "ই২ই স্টক শার্ট",
        categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: `e2e-${run}` } })).id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        options: { create: { type: "SIZE", nameEn: "Size", nameBn: "সাইজ", sortOrder: 0 } },
      },
      select: { id: true, options: { select: { id: true } } },
    });
    const optionId = product.options[0]?.id ?? "";
    for (const [index, size] of ["M", "L"].entries()) {
      const value = await prisma.optionValue.create({
        data: { optionId, valueEn: size, sortOrder: index },
      });
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: size === "M" ? skuM : skuL,
          barcode: `E2E${tag}${size}`,
          pricePoisha: 145_000,
          labelEn: size,
          optionKey: value.id,
          optionValues: { create: { optionValueId: value.id } },
        },
      });
    }

    // Phase 8: a product with stock at the default online location (with its
    // ledger row, so inventory:verify still passes), a 10% coupon and an
    // Order Staff member (for the 403 on coupons).
    const online = await prisma.location.findFirstOrThrow({
      where: { isDefaultOnlineFulfillment: true, isActive: true, deletedAt: null },
    });
    const checkoutSlug = `e2e-checkout-${run}`;
    const checkoutName = `E2E Checkout Shirt ${tag}`;
    const checkoutProduct = await prisma.product.create({
      data: {
        slug: checkoutSlug,
        nameEn: checkoutName,
        nameBn: `ই২ই চেকআউট শার্ট ${tag}`,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: `e2e-${run}` } })).id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        variants: {
          create: { sku: `E2E-CO-${tag}`, pricePoisha: 120_000, labelEn: "One size" },
        },
      },
      select: { variants: { select: { id: true } } },
    });
    const checkoutVariantId = checkoutProduct.variants[0]?.id ?? "";
    await prisma.inventoryLevel.create({
      data: { variantId: checkoutVariantId, locationId: online.id, onHand: 50, reserved: 0 },
    });
    await prisma.inventoryMovement.create({
      data: {
        variantId: checkoutVariantId,
        locationId: online.id,
        type: "OPENING",
        quantity: 50,
        onHandAfter: 50,
        reservedAfter: 0,
        reason: "E2E fixture",
      },
    });
    // Phase 9: another item stocked online, swapped in when the order is edited.
    const swapSku = `E2E-SW-${tag}`;
    const swapProduct = await prisma.product.create({
      data: {
        slug: `e2e-swap-${run}`,
        nameEn: `E2E Swap Shirt ${tag}`,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: `e2e-${run}` } })).id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        variants: {
          create: [
            { sku: swapSku, pricePoisha: 130_000, labelEn: "L" },
            // Another size, for the exchange from the tracking page.
            { sku: `${swapSku}-XL`, pricePoisha: 130_000, labelEn: "XL" },
          ],
        },
      },
      select: { variants: { select: { id: true } } },
    });
    for (const variant of swapProduct.variants) {
      await prisma.inventoryLevel.create({
        data: { variantId: variant.id, locationId: online.id, onHand: 20, reserved: 0 },
      });
      await prisma.inventoryMovement.create({
        data: {
          variantId: variant.id,
          locationId: online.id,
          type: "OPENING",
          quantity: 20,
          onHandAfter: 20,
          reservedAfter: 0,
          reason: "E2E fixture",
        },
      });
    }
    // Phase 9: a shop with its own manager and an item WITHOUT a barcode: the
    // labels test generates it, prints it and the till sells by scanning it.
    const tillBranch = await prisma.location.create({
      data: { code: `E2ET-${tag}`, type: "BRANCH", nameEn: `E2E Till ${run}`, isActive: true },
    });
    const tillManagerEmail = `e2e-${run}-till@test.local`;
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: tillManagerEmail,
        name: "E2E Till Manager",
        passwordHash,
        roleId: await role("Branch Manager"),
        locationAccess: { create: { locationId: tillBranch.id } },
      },
    });
    const tillSku = `E2E-TL-${tag}`;
    const tillProduct = await prisma.product.create({
      data: {
        slug: `e2e-till-${run}`,
        nameEn: `E2E Till Shirt ${tag}`,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: `e2e-${run}` } })).id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        variants: { create: { sku: tillSku, pricePoisha: 100_000, labelEn: "M" } },
      },
      select: { variants: { select: { id: true } } },
    });
    const tillVariantId = tillProduct.variants[0]?.id ?? "";
    await prisma.inventoryLevel.create({
      data: { variantId: tillVariantId, locationId: tillBranch.id, onHand: 10, reserved: 0 },
    });
    await prisma.inventoryMovement.create({
      data: {
        variantId: tillVariantId,
        locationId: tillBranch.id,
        type: "OPENING",
        quantity: 10,
        onHandAfter: 10,
        reservedAfter: 0,
        reason: "E2E fixture",
      },
    });
    const couponCode = `E2E${tag}`;
    await prisma.coupon.create({
      data: { code: couponCode, type: "PERCENTAGE", value: 10, channel: "ONLINE" },
    });
    const orderStaffEmail = `e2e-${run}-orders@test.local`;
    await prisma.user.create({
      data: {
        kind: "STAFF",
        email: orderStaffEmail,
        name: "E2E Order Staff",
        passwordHash,
        roleId: await role("Order Staff"),
        locationAccess: { create: { locationId: online.id } },
      },
    });
    const digits = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

    const fixture: E2EFixture = {
      run,
      password,
      managerEmail,
      inventoryEmail,
      editorEmail,
      categoryLabel: `${categoryName} [${code}]`,
      salesEmail,
      branchCode,
      stockSlug,
      stockName,
      skuM,
      skuL,
      checkoutSlug,
      checkoutName,
      couponCode,
      orderStaffEmail,
      swapSku,
      tillManagerEmail,
      tillSku,
      tillBranchCode: tillBranch.code,
      phoneBn: `017${digits()}`,
      phoneEn: `018${digits()}`,
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
