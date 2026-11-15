"use server";

import { updateTag } from "next/cache";

import { getRequestMeta } from "@/modules/access/access.service";
import { clearCartToken, readCartToken } from "@/modules/cart/cart-session";
import { STOCK_TAG } from "@/modules/inventory/stock-cache";
import { normalizeBdMobile } from "./phone";
import {
  placeOrder,
  quoteCheckout,
  trackOrder,
  type PlaceOrderResult,
  type QuoteView,
  type TrackResult,
} from "./checkout.service";

/**
 * Storefront checkout actions. Next.js checks the Origin header on every
 * Server Action (CSRF). Results carry codes the page translates; internal
 * messages and stack traces never reach the browser.
 */

export async function quoteCheckoutAction(
  payload: unknown,
): Promise<{ ok: true; quote: QuoteView } | { ok: false; error: string }> {
  try {
    const phoneInput =
      typeof payload === "object" && payload !== null && "phone" in payload
        ? String((payload as { phone: unknown }).phone ?? "")
        : "";
    const phone = normalizeBdMobile(phoneInput);
    const { phone: _ignored, ...rest } = (payload ?? {}) as Record<string, unknown>;
    return await quoteCheckout(
      await readCartToken(),
      rest,
      await getRequestMeta(),
      phone.ok ? phone.phone : null,
    );
  } catch (error) {
    console.error("[checkout] quote failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "FAILED" };
  }
}

export async function placeOrderAction(payload: unknown): Promise<PlaceOrderResult> {
  const result = await placeOrder(await readCartToken(), payload, await getRequestMeta());
  if (result.ok) {
    // The cart row is gone with the order; drop the cookie and refresh stock labels.
    await clearCartToken();
    if (!result.reused) updateTag(STOCK_TAG);
  }
  return result;
}

export async function trackOrderAction(payload: unknown): Promise<TrackResult> {
  try {
    return await trackOrder(payload, await getRequestMeta());
  } catch (error) {
    console.error("[track] failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "NOT_FOUND" };
  }
}
