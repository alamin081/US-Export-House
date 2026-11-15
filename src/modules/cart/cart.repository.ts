import "server-only";

import { db } from "@/lib/db";

/**
 * Guest carts. Only variant ids, quantities and the price last shown are
 * stored; names, prices and stock are always read fresh (see cart.service).
 */

const CART_SELECT = {
  id: true,
  expiresAt: true,
  items: {
    select: { id: true, variantId: true, quantity: true, seenPricePoisha: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

export type CartRow = NonNullable<Awaited<ReturnType<typeof findCartByTokenHash>>>;

export async function findCartByTokenHash(tokenHash: string) {
  return db.cart.findUnique({ where: { sessionToken: tokenHash }, select: CART_SELECT });
}

export async function createCart(tokenHash: string, expiresAt: Date) {
  return db.cart.create({
    data: { sessionToken: tokenHash, channel: "ONLINE", expiresAt },
    select: CART_SELECT,
  });
}

/** Slides the expiry forward on every change. */
export async function touchCart(cartId: string, expiresAt: Date) {
  await db.cart.update({ where: { id: cartId }, data: { expiresAt } });
}

export async function upsertCartItem(
  cartId: string,
  variantId: string,
  quantity: number,
  seenPricePoisha: number,
) {
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    create: { cartId, variantId, quantity, seenPricePoisha },
    update: { quantity, seenPricePoisha },
  });
}

export async function deleteCartItem(cartId: string, variantId: string) {
  await db.cartItem.deleteMany({ where: { cartId, variantId } });
}

/** The customer has seen the current prices: stop showing "price changed". */
export async function acknowledgePrices(cartId: string, prices: ReadonlyMap<string, number>) {
  await db.$transaction(
    [...prices.entries()].map(([variantId, seenPricePoisha]) =>
      db.cartItem.updateMany({ where: { cartId, variantId }, data: { seenPricePoisha } }),
    ),
  );
}

export async function deleteExpiredCarts(now: Date): Promise<number> {
  const result = await db.cart.deleteMany({ where: { expiresAt: { lt: now }, userId: null } });
  return result.count;
}

/** Everything the cart, checkout and coupon rules need about each variant. */
export async function findCartVariants(variantIds: readonly string[]) {
  if (variantIds.length === 0) return [];
  return db.productVariant.findMany({
    where: { id: { in: [...variantIds] } },
    select: {
      id: true,
      sku: true,
      pricePoisha: true,
      comparePricePoisha: true,
      labelEn: true,
      labelBn: true,
      isActive: true,
      deletedAt: true,
      optionValues: {
        select: {
          optionValue: {
            select: { id: true, valueEn: true, valueBn: true, option: { select: { type: true } } },
          },
        },
      },
      product: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameBn: true,
          status: true,
          deletedAt: true,
          categoryId: true,
          extraCategories: { select: { categoryId: true } },
          images: {
            select: { url: true, optionValueId: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

export type CartVariantRow = Awaited<ReturnType<typeof findCartVariants>>[number];

/** Each category with every category above it (for coupon category scopes). */
export async function findCategoryAncestors(
  categoryIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (categoryIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<{ startId: string; id: string }>>`
    WITH RECURSIVE up AS (
      SELECT c."id" AS "startId", c."id", c."parentId", 0 AS depth
      FROM "Category" c WHERE c."id" = ANY(${[...categoryIds]}::text[])
      UNION ALL
      SELECT up."startId", p."id", p."parentId", up.depth + 1
      FROM "Category" p JOIN up ON p."id" = up."parentId"
      WHERE up.depth < 10
    )
    SELECT "startId", "id" FROM up
  `;
  const result = new Map<string, string[]>();
  for (const row of rows) result.set(row.startId, [...(result.get(row.startId) ?? []), row.id]);
  return result;
}
