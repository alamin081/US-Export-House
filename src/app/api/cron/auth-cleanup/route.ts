import { NextResponse, type NextRequest } from "next/server";

import { purgeExpiredAuthRecords } from "@/modules/access/auth.service";
import { checkCronAuthorization } from "@/modules/system/cron-auth";

/**
 * Scheduled clean-up of expired or idle staff sessions and finished sign-in
 * throttle windows. Meant for Vercel Cron (wired up with the deployment in
 * Phase 13); it is idempotent and safe to call more often.
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

  const removed = await purgeExpiredAuthRecords();
  return NextResponse.json({ removed }, { headers: NO_STORE });
}
