import { NextResponse, type NextRequest } from "next/server";

import { purgeExpiredCarts } from "@/modules/cart/cart.service";
import { checkCronAuthorization } from "@/modules/system/cron-auth";

/**
 * Scheduled clean-up of guest carts past their expiry (setting
 * `cart.ttlDays`, default 30 days). Needs `Authorization: Bearer
 * <CRON_SECRET>`; idempotent and safe to call more often.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  const authorization = checkCronAuthorization(request.headers.get("authorization"));
  if (authorization === "not_configured") {
    return NextResponse.json(
      { error: { code: "CRON_NOT_CONFIGURED" } },
      { status: 503, headers: NO_STORE },
    );
  }
  if (authorization === "unauthorized") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED" } },
      { status: 401, headers: NO_STORE },
    );
  }

  const removed = await purgeExpiredCarts();
  return NextResponse.json({ removed }, { headers: NO_STORE });
}
