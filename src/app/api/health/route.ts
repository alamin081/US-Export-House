import { NextResponse } from "next/server";

import { getSystemHealth } from "@/modules/system/system.service";

/**
 * Health check for uptime monitoring and deployment smoke tests.
 *
 * Returns 200 when the database is reachable and 503 when it is not, so an
 * uptime monitor can alert without parsing the body.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getSystemHealth();

  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
