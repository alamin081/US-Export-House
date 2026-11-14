import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { lookupVariant, searchVariantsForPicker } from "@/modules/inventory/inventory.service";

/**
 * Item lookup for the scan / SKU inputs: `?code=` resolves one scanned
 * barcode or SKU (404 when unknown), `?q=` searches by name, SKU or barcode.
 * No cost is ever returned.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const guard = await requireStaffApi("inventory.read");
  if ("response" in guard) return guard.response;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const q = url.searchParams.get("q");
  try {
    if (code !== null) {
      return NextResponse.json(
        { item: await lookupVariant(guard.staff, code) },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { items: await searchVariantsForPicker(guard.staff, q ?? "") },
      { headers: NO_STORE },
    );
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
