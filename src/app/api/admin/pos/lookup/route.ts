import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { lookupTillItem } from "@/modules/pos/pos.service";

/**
 * Till lookup: `?location=&code=` resolves a scanned barcode or SKU (404 when
 * unknown), `?q=` searches by name, SKU or barcode. Price and the stock
 * available at that location; never the purchase cost.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const guard = await requireStaffApi("pos.sell");
  if ("response" in guard) return guard.response;
  const url = new URL(request.url);
  const location = url.searchParams.get("location") ?? "";
  try {
    const result = await lookupTillItem(guard.staff, location, {
      code: url.searchParams.get("code"),
      q: url.searchParams.get("q"),
    });
    if (url.searchParams.get("code") !== null && result.item === null) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Unknown barcode or SKU." } },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.httpStatus, headers: NO_STORE },
      );
    }
    throw error;
  }
}
