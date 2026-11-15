import { NextResponse, type NextRequest } from "next/server";

import { listDistricts } from "@/modules/shipping/shipping.service";

/** Districts of one division, for the checkout address picker. */
export async function GET(request: NextRequest) {
  const division = request.nextUrl.searchParams.get("division") ?? "";
  if (!/^div-\d{2}$/.test(division)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 422 });
  }
  return NextResponse.json(
    { districts: await listDistricts(division) },
    { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
