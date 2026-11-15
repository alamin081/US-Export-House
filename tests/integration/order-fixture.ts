import { env } from "@/config/env";
import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES, type PermissionKey } from "@/modules/access/permissions";
import { addToCart } from "@/modules/cart/cart.service";
import { issueFormToken } from "@/modules/checkout/checkout-crypto";
import { placeOrder, quoteCheckout } from "@/modules/checkout/checkout.service";
import { applyStockMovements } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";

/**
 * Shared setup for the Phase 9 suites: a product with stock at the default
 * online location, orders placed through the real checkout, and staff
 * contexts for any role. Every record carries the suite's run prefix.
 */

export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export interface Fixture {
  run: string;
  locationId: string;
  variants: Record<string, string>;
  productId: string;
  area: { divisionId: string; districtId: string; upazilaId: string };
}

let ipCounter = 0;
let phoneCounter = 0;
let staffCounter = 0;

export const testMeta = () => ({
  ip: `198.18.${(ipCounter += 1) % 250}.${Math.floor(Math.random() * 250)}`,
  userAgent: "orders-it",
});

export const freshPhone = () =>
  `018${String(Date.now() % 1_000_000).padStart(6, "0")}${String((phoneCounter += 1) % 100).padStart(2, "0")}`;

/** A product with the given variants (key -> [price poisha, opening stock]). */
export async function createFixture(
  run: string,
  spec: Record<string, [price: number, stock: number]>,
): Promise<Fixture> {
  const location = await db.location.findFirstOrThrow({
    where: { isDefaultOnlineFulfillment: true, isActive: true, deletedAt: null },
  });
  const district = await db.geoDistrict.findUniqueOrThrow({ where: { id: "dist-47" } });
  const category = await db.category.create({
    data: { slug: `it-ord-${run.toLowerCase()}`, nameEn: `Orders ${run}` },
  });
  const product = await db.product.create({
    data: {
      slug: `it-ord-${run.toLowerCase()}`,
      nameEn: `Order Shirt ${run}`,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: Object.entries(spec).map(([key, [price]]) => ({
          sku: `OR-${run}-${key}`,
          pricePoisha: price,
          labelEn: key,
        })),
      },
    },
    select: { id: true, variants: { select: { id: true, sku: true } } },
  });
  const variants: Record<string, string> = {};
  for (const row of product.variants) variants[row.sku.split("-").pop()!] = row.id;
  await runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      Object.entries(spec)
        .filter(([, [, stock]]) => stock > 0)
        .map(([key, [, stock]]) => ({
          variantId: variants[key]!,
          locationId: location.id,
          type: "OPENING" as const,
          quantity: stock,
          userId: null,
          reason: "orders integration",
        })),
    ),
  );
  return {
    run,
    locationId: location.id,
    variants,
    productId: product.id,
    area: { divisionId: district.divisionId, districtId: district.id, upazilaId: "dhk-metro-13" },
  };
}

/** Places a COD order through the real checkout and returns the order row. */
export async function placeTestOrder(
  fixture: Fixture,
  lines: Array<[key: string, quantity: number]>,
  options: { couponCode?: string; phone?: string } = {},
) {
  let token: string | null = null;
  for (const [key, quantity] of lines) {
    const added = await addToCart(token, fixture.variants[key]!, quantity);
    if (!added.ok) throw new Error(`could not add ${key}: ${JSON.stringify(added)}`);
    token = added.token;
  }
  const phone = options.phone ?? freshPhone();
  const quoted = await quoteCheckout(
    token,
    { area: fixture.area, couponCode: options.couponCode ?? null },
    testMeta(),
    `+88${phone}`,
  );
  if (!quoted.ok) throw new Error(quoted.error);
  const placed = await placeOrder(
    token,
    {
      area: fixture.area,
      name: "Order Test Customer",
      phone,
      email: "",
      street: "House 9, Road 4, Block B",
      landmark: "",
      note: "",
      couponCode: quoted.quote.coupon?.code ?? null,
      quoteHash: quoted.quote.hash,
      idempotencyKey: `${fixture.run}-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      formToken: issueFormToken(Date.now() - 10_000, env.AUTH_SECRET),
      website: "",
      paymentMethod: "COD",
    },
    testMeta(),
  );
  if (!placed.ok) throw new Error(`order refused: ${JSON.stringify(placed)}`);
  return db.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    include: { items: { orderBy: { id: "asc" } } },
  });
}

/** A staff context for a role, optionally with other permissions or locations. */
export async function staffFor(
  run: string,
  roleName: string,
  options: { permissions?: readonly PermissionKey[]; locationIds?: readonly string[] } = {},
): Promise<StaffContext> {
  const definition = SYSTEM_ROLES.find((role) => role.name === roleName);
  if (definition === undefined) throw new Error(roleName);
  const role = await db.role.findFirstOrThrow({ where: { name: roleName } });
  const user = await db.user.create({
    data: {
      kind: "STAFF",
      email: `orders-${run.toLowerCase()}-${(staffCounter += 1)}@test.local`,
      name: `${roleName} ${staffCounter}`,
      roleId: role.id,
    },
  });
  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name,
    roleId: role.id,
    roleName,
    permissions: [...(options.permissions ?? definition.permissions)],
    allLocations: options.locationIds === undefined ? definition.allLocations : false,
    locationIds: [...(options.locationIds ?? [])],
    sessionId: "integration",
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

export async function stockOf(variantId: string, locationId: string) {
  const row = await db.inventoryLevel.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
    select: { onHand: true, reserved: true },
  });
  return row ?? { onHand: 0, reserved: 0 };
}

export async function caught(
  promise: Promise<unknown>,
): Promise<{ code?: string; message?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message?: string };
  }
  throw new Error("expected the call to fail");
}
