import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { createUploadTicket } from "@/modules/media/media.service";

/**
 * Starts an image upload. With Cloudinary the response holds signed form
 * fields for a direct browser upload (no secret); with mock storage it points
 * at /api/admin/uploads/mock.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST() {
  const guard = await requireStaffApi("catalog.read");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json(await createUploadTicket(guard.staff), { headers: NO_STORE });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code } },
        { status: error.httpStatus, headers: NO_STORE },
      );
    }
    throw error;
  }
}
