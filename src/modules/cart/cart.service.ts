import "server-only";

import type { LocalizedText } from "@/lib/content";
import { getAvailability } from "@/modules/inventory/inventory.service";
import type { PricedLine } from "@/modules/checkout/pricing";
import { getCheckoutSettings, type CheckoutSettings } from "@/modules/settings/settings.service";
import {
  checkCartLine,
  checkNewQuantity,
  priceChange,
  type LineProblem,
  type QuantityRefusal,
} from "./cart-rules";
import { generateCartToken, hashCartToken } from "./cart-token";
import {
  acknowledgePrices,
  createCart,
  deleteCartItem,
  deleteExpiredCarts,
  findCartByTokenHash,
  findCartVariants,
  findCategoryAncestors,
  touchCart,
  upsertCartItem,
  type CartRow,
  type CartVariantRow,
} from "./cart.repository";

/**
 * Guest cart. The caller (a Server Action or route) owns the cookie and
 * passes the raw token in; this module never trusts a price or quantity from
 * the browser and re-reads prices and default-location stock every time.
 */

export interface CartViewLine {
  variantId: string;
  productSlug: string;
  name: LocalizedText;
  sku: string;
  size: LocalizedText | null;
  colour: LocalizedText | null;
  imageUrl: string | null;
  quantity: number;
  unitPricePoisha: number;
  compareAtPoisha: number | null;
  lineTotalPoisha: number;
  /** Highest quantity the stepper offers: stock and the per-item limit. */
  maxQuantity: number;
  problem: LineProblem | null;
  suggestedQuantity: number | null;
  priceChange: { fromPoisha: number; toPoisha: number } | null;
}

export interface CartView {
  lines: CartViewLine[];
  units: number;
  subtotalPoisha: number;
  /** False while any line has a problem or the cart is over the item limit. */
  canCheckout: boolean;
  overItemLimit: boolean;
  maxItemsPerOrder: number;
  freeShippingThresholdPoisha: number;
  /** How much more makes delivery free (before any coupon); 0 when reached. */
  toFreeShippingPoisha: number;
}

/** A cart line with what checkout needs on top of the view. */
export interface CheckoutCartLine extends CartViewLine {
  priced: PricedLine;
  productId: string;
  sizeEn: string | null;
  sizeBn: string | null;
  colourEn: string | null;
  colourBn: string | null;
  variantLabel: string | null;
}

const EMPTY_VIEW = (settings: CheckoutSettings): CartView => ({
  lines: [],
  units: 0,
  subtotalPoisha: 0,
  canCheckout: false,
  overItemLimit: false,
  maxItemsPerOrder: settings.maxItemsPerOrder,
  freeShippingThresholdPoisha: settings.freeShippingThresholdPoisha,
  toFreeShippingPoisha: settings.freeShippingThresholdPoisha,
});

function expiryFrom(settings: CheckoutSettings, now = new Date()): Date {
  return new Date(now.getTime() + settings.cartTtlDays * 24 * 60 * 60 * 1000);
}

async function loadCart(token: string | null): Promise<CartRow | null> {
  if (token === null) return null;
  const cart = await findCartByTokenHash(hashCartToken(token));
  if (cart === null) return null;
  if (cart.expiresAt !== null && cart.expiresAt < new Date()) return null;
  return cart;
}

function isLive(variant: CartVariantRow): boolean {
  return (
    variant.isActive &&
    variant.deletedAt === null &&
    variant.product.status === "PUBLISHED" &&
    variant.product.deletedAt === null
  );
}

function optionText(variant: CartVariantRow, type: "SIZE" | "COLOUR"): LocalizedText | null {
  const value = variant.optionValues.find((link) => link.optionValue.option.type === type);
  if (value === undefined) return null;
  return {
    en: value.optionValue.valueEn,
    ...(value.optionValue.valueBn === null ? {} : { bn: value.optionValue.valueBn }),
  };
}

/** The colour's own photo when there is one, else the product's main image. */
function imageFor(variant: CartVariantRow): string | null {
  const colourId = variant.optionValues.find((link) => link.optionValue.option.type === "COLOUR")
    ?.optionValue.id;
  const images = variant.product.images;
  return (
    images.find((image) => colourId !== undefined && image.optionValueId === colourId)?.url ??
    images[0]?.url ??
    null
  );
}

async function buildLines(
  items: CartRow["items"],
  settings: CheckoutSettings,
): Promise<CheckoutCartLine[]> {
  const variantIds = items.map((item) => item.variantId);
  const [variants, available] = await Promise.all([
    findCartVariants(variantIds),
    getAvailability({ online: true }, variantIds),
  ]);
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const ownCategories = [
    ...new Set(
      variants.flatMap((variant) => [
        variant.product.categoryId,
        ...variant.product.extraCategories.map((link) => link.categoryId),
      ]),
    ),
  ];
  const ancestors = await findCategoryAncestors(ownCategories);

  const lines: CheckoutCartLine[] = [];
  for (const item of items) {
    const variant = byId.get(item.variantId);
    if (variant === undefined) continue; // deleted outright: the row cascades away
    const stock = available.get(item.variantId) ?? 0;
    const live = isLive(variant);
    const check = checkCartLine({
      quantity: item.quantity,
      live,
      available: stock,
      maxQtyPerVariant: settings.maxQtyPerVariant,
    });
    const size = optionText(variant, "SIZE");
    const colour = optionText(variant, "COLOUR");
    const categoryIds = [
      ...new Set(
        [
          variant.product.categoryId,
          ...variant.product.extraCategories.map((link) => link.categoryId),
        ].flatMap((id) => ancestors.get(id) ?? [id]),
      ),
    ];
    const priced: PricedLine = {
      key: variant.id,
      unitPricePoisha: variant.pricePoisha,
      compareAtPoisha: variant.comparePricePoisha,
      quantity: item.quantity,
      productId: variant.product.id,
      categoryIds,
    };
    lines.push({
      variantId: variant.id,
      productSlug: variant.product.slug,
      name: {
        en: variant.product.nameEn,
        ...(variant.product.nameBn === null ? {} : { bn: variant.product.nameBn }),
      },
      sku: variant.sku,
      size,
      colour,
      imageUrl: imageFor(variant),
      quantity: item.quantity,
      unitPricePoisha: variant.pricePoisha,
      compareAtPoisha:
        variant.comparePricePoisha !== null && variant.comparePricePoisha > variant.pricePoisha
          ? variant.comparePricePoisha
          : null,
      lineTotalPoisha: variant.pricePoisha * item.quantity,
      maxQuantity: live ? Math.max(0, Math.min(stock, settings.maxQtyPerVariant)) : 0,
      problem: check.problem,
      suggestedQuantity: check.suggestedQuantity,
      priceChange: live ? priceChange(item.seenPricePoisha, variant.pricePoisha) : null,
      priced,
      productId: variant.product.id,
      sizeEn: size?.en ?? null,
      sizeBn: size?.bn ?? null,
      colourEn: colour?.en ?? null,
      colourBn: colour?.bn ?? null,
      variantLabel: variant.labelEn,
    });
  }
  return lines;
}

function summarise(lines: CheckoutCartLine[], settings: CheckoutSettings): CartView {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines
    .filter((line) => line.problem !== "UNAVAILABLE")
    .reduce((sum, line) => sum + line.lineTotalPoisha, 0);
  const overItemLimit = units > settings.maxItemsPerOrder;
  return {
    lines: lines.map(toViewLine),
    units,
    subtotalPoisha: subtotal,
    canCheckout: lines.length > 0 && !overItemLimit && lines.every((line) => line.problem === null),
    overItemLimit,
    maxItemsPerOrder: settings.maxItemsPerOrder,
    freeShippingThresholdPoisha: settings.freeShippingThresholdPoisha,
    toFreeShippingPoisha: Math.max(0, settings.freeShippingThresholdPoisha - subtotal),
  };
}

/** Strips the server-only fields before a line goes to the browser. */
function toViewLine(line: CheckoutCartLine): CartViewLine {
  return {
    variantId: line.variantId,
    productSlug: line.productSlug,
    name: line.name,
    sku: line.sku,
    size: line.size,
    colour: line.colour,
    imageUrl: line.imageUrl,
    quantity: line.quantity,
    unitPricePoisha: line.unitPricePoisha,
    compareAtPoisha: line.compareAtPoisha,
    lineTotalPoisha: line.lineTotalPoisha,
    maxQuantity: line.maxQuantity,
    problem: line.problem,
    suggestedQuantity: line.suggestedQuantity,
    priceChange: line.priceChange,
  };
}

export async function getCartView(token: string | null): Promise<CartView> {
  const settings = await getCheckoutSettings();
  const cart = await loadCart(token);
  if (cart === null || cart.items.length === 0) return EMPTY_VIEW(settings);
  return summarise(await buildLines(cart.items, settings), settings);
}

/** For the checkout: the full lines (with pricing facts) and the summary. */
export async function getCheckoutCart(token: string | null) {
  const settings = await getCheckoutSettings();
  const cart = await loadCart(token);
  if (cart === null || cart.items.length === 0) {
    return { cartId: null, lines: [] as CheckoutCartLine[], view: EMPTY_VIEW(settings), settings };
  }
  const lines = await buildLines(cart.items, settings);
  return { cartId: cart.id, lines, view: summarise(lines, settings), settings };
}

export async function getCartCount(token: string | null): Promise<number> {
  const cart = await loadCart(token);
  return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

export type CartChangeResult =
  | { ok: true; token: string; units: number }
  | ({ ok: false } & (QuantityRefusal | { refusal: "NOT_FOUND" }));

/**
 * Sets one line's quantity (`mode: "add"` adds to what is there). 0 removes
 * the line. A new cart (and token) is created only when something is added.
 */
async function changeQuantity(
  token: string | null,
  variantId: string,
  quantity: number,
  mode: "add" | "set",
): Promise<CartChangeResult> {
  const settings = await getCheckoutSettings();
  let cart = await loadCart(token);
  const existing = cart?.items.find((item) => item.variantId === variantId);
  const current = existing?.quantity ?? 0;
  const next = Math.max(0, mode === "add" ? current + quantity : quantity);
  const otherUnits =
    cart?.items
      .filter((item) => item.variantId !== variantId)
      .reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  if (next === 0) {
    if (cart !== null && token !== null) {
      await deleteCartItem(cart.id, variantId);
      await touchCart(cart.id, expiryFrom(settings));
    }
    return { ok: true, token: token ?? "", units: otherUnits };
  }

  const [variant] = await findCartVariants([variantId]);
  if (variant === undefined) return { ok: false, refusal: "NOT_FOUND" };
  const available = (await getAvailability({ online: true }, [variantId])).get(variantId) ?? 0;
  const refusal = checkNewQuantity({
    current,
    next,
    live: isLive(variant),
    available,
    otherUnits,
    maxQtyPerVariant: settings.maxQtyPerVariant,
    maxItemsPerOrder: settings.maxItemsPerOrder,
  });
  if (refusal !== null) return { ok: false, ...refusal };

  let cartToken = token;
  if (cart === null || cartToken === null) {
    cartToken = generateCartToken();
    cart = await createCart(hashCartToken(cartToken), expiryFrom(settings));
  } else {
    await touchCart(cart.id, expiryFrom(settings));
  }
  await upsertCartItem(cart.id, variantId, next, variant.pricePoisha);
  return { ok: true, token: cartToken, units: otherUnits + next };
}

export function addToCart(token: string | null, variantId: string, quantity: number) {
  return changeQuantity(token, variantId, quantity, "add");
}

export function setCartQuantity(token: string | null, variantId: string, quantity: number) {
  return changeQuantity(token, variantId, quantity, "set");
}

export function removeFromCart(token: string | null, variantId: string) {
  return changeQuantity(token, variantId, 0, "set");
}

/** "I've seen the new prices": hides the price-changed notes. */
export async function acknowledgeCartPrices(token: string | null): Promise<void> {
  const cart = await loadCart(token);
  if (cart === null || cart.items.length === 0) return;
  const variants = await findCartVariants(cart.items.map((item) => item.variantId));
  await acknowledgePrices(
    cart.id,
    new Map(variants.map((variant) => [variant.id, variant.pricePoisha])),
  );
}

/** Scheduled clean-up of guest carts past their expiry. Idempotent. */
export async function purgeExpiredCarts(): Promise<number> {
  return deleteExpiredCarts(new Date());
}
