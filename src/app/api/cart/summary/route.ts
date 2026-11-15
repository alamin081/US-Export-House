import { NextResponse } from "next/server";

import { readCartToken } from "@/modules/cart/cart-session";
import { getCartCount } from "@/modules/cart/cart.service";

/**
 * The header's cart count. Fetched by the browser after the (cached) page
 * loads, so cached pages never depend on a visitor's cart. Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let units = 0;
  try {
    units = await getCartCount(await readCartToken());
  } catch (error) {
    console.error("[cart] count failed", error instanceof Error ? error.name : "unknown");
  }
  return NextResponse.json({ units }, { headers: { "cache-control": "private, no-store" } });
}
