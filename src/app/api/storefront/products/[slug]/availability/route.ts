import { NextResponse } from "next/server";

import { cachedProductStockStatus } from "@/modules/inventory/storefront-stock.cached";

/**
 * Per-variant stock state for one product page: "in", "few" or "out" — never
 * a quantity. The page itself stays cached; the purchase panel fetches this.
 * Shared caches may keep it 30 s (and serve it stale for 60 s more).
 */
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 120) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const variants = await cachedProductStockStatus(slug);
  if (Object.keys(variants).length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { variants },
    { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
