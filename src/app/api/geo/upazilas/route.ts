import { NextResponse, type NextRequest } from "next/server";

import { listUpazilas } from "@/modules/shipping/shipping.service";

/** Upazilas / thanas of one district, for the checkout address picker. */
export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district") ?? "";
  if (!/^dist-\d{2}$/.test(district)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 422 });
  }
  return NextResponse.json(
    { upazilas: await listUpazilas(district) },
    { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
