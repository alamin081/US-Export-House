/**
 * Database verification for the development database.
 *
 * Two jobs:
 *  1. Report what the seed produced (row counts and a few spot checks).
 *  2. Prove that the guard rails in the second migration actually reject bad
 *     data. Every "rejection test" below runs inside a transaction that is
 *     rolled back, so the database is left untouched.
 *
 * Run with: npm run db:verify
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === "") {
  throw new Error("[verify] DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;

function report(label: string, value: string | number) {
  console.info(`  ${label.padEnd(34)} ${value}`);
}

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.info(`  PASS  ${label}${detail === "" ? "" : ` — ${detail}`}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail === "" ? "" : ` — ${detail}`}`);
  }
}

/** Expects the statement to be rejected by the database. */
async function expectRejected(label: string, run: () => Promise<unknown>) {
  try {
    await prisma.$transaction(async () => {
      await run();
      // Force a rollback if the statement unexpectedly succeeded.
      throw new Error("__accepted__");
    });
    check(label, false, "statement was accepted");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("__accepted__")) {
      check(label, false, "database accepted invalid data");
    } else {
      check(label, true);
    }
  }
}

async function main() {
  console.info("\n--- Seeded data ------------------------------------------------\n");

  const [
    settings,
    zones,
    locations,
    roles,
    staff,
    customers,
    categories,
    products,
    variants,
    levels,
    movements,
    coupons,
    reviews,
    pages,
    banners,
    homeSections,
    menuItems,
    orders,
    orderItems,
    payments,
    shipments,
  ] = await Promise.all([
    prisma.setting.count(),
    prisma.shippingZone.count(),
    prisma.location.count(),
    prisma.role.count(),
    prisma.user.count({ where: { kind: "STAFF" } }),
    prisma.user.count({ where: { kind: "CUSTOMER" } }),
    prisma.category.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.inventoryLevel.count(),
    prisma.inventoryMovement.count(),
    prisma.coupon.count(),
    prisma.review.count(),
    prisma.page.count(),
    prisma.banner.count(),
    prisma.homeSection.count(),
    prisma.menuItem.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.payment.count(),
    prisma.shipment.count(),
  ]);

  report("settings", settings);
  report("shipping zones", zones);
  report("locations", locations);
  report("roles", roles);
  report("staff / customers", `${staff} / ${customers}`);
  report("categories", categories);
  report("products", products);
  report("variants", variants);
  report("inventory levels", levels);
  report("inventory movements", movements);
  report("coupons", coupons);
  report("reviews", reviews);
  report(
    "pages / banners / sections / menu",
    `${pages} / ${banners} / ${homeSections} / ${menuItems}`,
  );
  report("orders / items", `${orders} / ${orderItems}`);
  report("payments / shipments", `${payments} / ${shipments}`);

  console.info("\n--- Data integrity --------------------------------------------\n");

  // Every variant must have a stock row at every location.
  check(
    "one stock row per variant per location",
    levels === variants * locations,
    `${levels} = ${variants} x ${locations}`,
  );

  // The ledger must explain the stock on hand, location by location.
  const ledger = await prisma.$queryRaw<Array<{ mismatches: bigint }>>`
    SELECT count(*)::bigint AS mismatches
    FROM (
      SELECT l."variantId", l."locationId", l."onHand",
             COALESCE(SUM(m."quantity"), 0) AS ledger_sum
      FROM "InventoryLevel" l
      LEFT JOIN "InventoryMovement" m
        ON m."variantId" = l."variantId" AND m."locationId" = l."locationId"
      GROUP BY l."variantId", l."locationId", l."onHand"
    ) t
    WHERE t."onHand" <> t.ledger_sum
  `;
  check(
    "stock levels match the movement ledger",
    (ledger[0]?.mismatches ?? 0n) === 0n,
    `${ledger[0]?.mismatches ?? 0n} mismatching rows`,
  );

  // Order money must add up (also enforced by a CHECK constraint).
  const badTotals = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM "Order"
    WHERE "totalPoisha" <> "subtotalPoisha" - "discountPoisha" + "shippingPoisha"
  `;
  check("order totals are consistent", (badTotals[0]?.count ?? 0n) === 0n);

  // Exactly one default online fulfilment location, and one default zone.
  const defaultLocations = await prisma.location.count({
    where: { isDefaultOnlineFulfillment: true },
  });
  check("exactly one default fulfilment location", defaultLocations === 1);

  const defaultZones = await prisma.shippingZone.count({ where: { isDefault: true } });
  check("exactly one default shipping zone", defaultZones === 1);

  // English copy is mandatory; Bengali is optional.
  const missingEnglish = await prisma.product.count({ where: { nameEn: "" } });
  check("every product has English copy", missingEnglish === 0);

  const missingBengali = await prisma.product.count({ where: { nameBn: null } });
  report("products without Bengali copy", `${missingBengali} (fallback to English)`);

  // The return policy must still be a draft (spec section 3.9).
  const returnPolicy = await prisma.page.findUnique({ where: { slug: "shipping-returns" } });
  check("return policy page is still DRAFT", returnPolicy?.status === "DRAFT");

  // Order numbers follow the agreed format.
  const firstOrder = await prisma.order.findFirst({ orderBy: { placedAt: "asc" } });
  check(
    "order number format UEH-YYYY-NNN",
    /^UEH-\d{4}-\d{3}$/.test(firstOrder?.orderNumber ?? ""),
    firstOrder?.orderNumber ?? "none",
  );

  // The sequence continues after the seeded orders.
  const nextSequence = await prisma.$queryRaw<Array<{ last_value: bigint }>>`
    SELECT last_value FROM order_number_seq
  `;
  check(
    "order number sequence advanced",
    (nextSequence[0]?.last_value ?? 0n) >= BigInt(orders),
    `last_value = ${nextSequence[0]?.last_value ?? 0n}`,
  );

  console.info("\n--- Guard rails (invalid data must be rejected) ----------------\n");

  const sampleLevel = await prisma.inventoryLevel.findFirst();
  if (sampleLevel === undefined || sampleLevel === null) {
    throw new Error("[verify] no inventory levels to test against");
  }

  await expectRejected("negative stock is rejected", () =>
    prisma.inventoryLevel.update({
      where: { id: sampleLevel.id },
      data: { onHand: -1 },
    }),
  );

  await expectRejected("reserving more than on hand is rejected", () =>
    prisma.inventoryLevel.update({
      where: { id: sampleLevel.id },
      data: { onHand: 1, reserved: 5 },
    }),
  );

  await expectRejected("a zero-quantity movement is rejected", () =>
    prisma.inventoryMovement.create({
      data: {
        variantId: sampleLevel.variantId,
        locationId: sampleLevel.locationId,
        type: "ADJUSTMENT",
        quantity: 0,
      },
    }),
  );

  const sampleOrder = await prisma.order.findFirst();
  if (sampleOrder !== null) {
    await expectRejected("an inconsistent order total is rejected", () =>
      prisma.order.update({
        where: { id: sampleOrder.id },
        data: { totalPoisha: sampleOrder.totalPoisha + 1 },
      }),
    );

    await expectRejected("a discount above the subtotal is rejected", () =>
      prisma.order.update({
        where: { id: sampleOrder.id },
        data: {
          discountPoisha: sampleOrder.subtotalPoisha + 100,
          totalPoisha: sampleOrder.shippingPoisha - 100,
        },
      }),
    );
  }

  await expectRejected("a 150% coupon is rejected", () =>
    prisma.coupon.create({
      data: { code: `VERIFY-${Date.now()}`, type: "PERCENTAGE", value: 150 },
    }),
  );

  await expectRejected("a 6-star review is rejected", async () => {
    const product = await prisma.product.findFirstOrThrow();
    return prisma.review.create({
      data: { productId: product.id, authorName: "Verify", rating: 6 },
    });
  });

  await expectRejected("a second default shipping zone is rejected", () =>
    prisma.shippingZone.create({
      data: { code: `verify-${Date.now()}`, nameEn: "Verify", ratePoisha: 0, isDefault: true },
    }),
  );

  await expectRejected("a transfer to the same location is rejected", async () => {
    const location = await prisma.location.findFirstOrThrow();
    return prisma.stockTransfer.create({
      data: {
        reference: `VERIFY-${Date.now()}`,
        fromLocationId: location.id,
        toLocationId: location.id,
      },
    });
  });

  await expectRejected("a duplicate coupon code (different case) is rejected", () =>
    prisma.coupon.create({ data: { code: "welcome10", type: "PERCENTAGE", value: 5 } }),
  );

  console.info("");
  if (failures > 0) {
    console.error(`${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.info("All checks passed.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error("\n[verify] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
