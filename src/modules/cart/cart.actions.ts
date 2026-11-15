"use server";

import { z } from "zod";

import { readCartToken, writeCartToken } from "./cart-session";
import {
  acknowledgeCartPrices,
  addToCart,
  removeFromCart,
  setCartQuantity,
  type CartChangeResult,
} from "./cart.service";

/**
 * Storefront cart actions. The browser sends only a variant id and a
 * quantity; the service checks the catalogue, stock and limits. Results carry
 * a refusal code that the page translates, never an internal message.
 */

export type CartActionResult =
  | { ok: true; units: number }
  | {
      ok: false;
      refusal:
        | "UNAVAILABLE"
        | "OUT_OF_STOCK"
        | "STOCK_LIMIT"
        | "PER_VARIANT"
        | "PER_ORDER"
        | "NOT_FOUND"
        | "FAILED";
      available?: number;
      max?: number;
    };

const lineSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.number().int().min(0).max(99),
});

async function run(
  payload: unknown,
  change: (token: string | null, variantId: string, quantity: number) => Promise<CartChangeResult>,
): Promise<CartActionResult> {
  const parsed = lineSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, refusal: "FAILED" };
  try {
    const result = await change(await readCartToken(), parsed.data.variantId, parsed.data.quantity);
    if (!result.ok) {
      const { ok: _ok, ...refusal } = result;
      return { ok: false, ...refusal };
    }
    // Every change slides the cookie's expiry, like the cart's.
    if (result.token !== "") await writeCartToken(result.token);
    return { ok: true, units: result.units };
  } catch (error) {
    console.error("[cart] change failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, refusal: "FAILED" };
  }
}

export async function addToCartAction(payload: unknown): Promise<CartActionResult> {
  return run(payload, (token, variantId, quantity) =>
    addToCart(token, variantId, Math.max(1, quantity)),
  );
}

export async function setCartQuantityAction(payload: unknown): Promise<CartActionResult> {
  return run(payload, setCartQuantity);
}

export async function removeFromCartAction(payload: unknown): Promise<CartActionResult> {
  return run(payload, (token, variantId) => removeFromCart(token, variantId));
}

export async function acknowledgeCartPricesAction(): Promise<void> {
  try {
    await acknowledgeCartPrices(await readCartToken());
  } catch (error) {
    console.error("[cart] acknowledge failed", error instanceof Error ? error.name : "unknown");
  }
}
