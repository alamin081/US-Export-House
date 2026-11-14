import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { getRequestMeta } from "@/modules/access/access.service";
import { completeDirectUpload } from "@/modules/media/media.service";

/**
 * Finishes a direct Cloudinary upload: the server asks Cloudinary what was
 * stored and keeps it only if the format and size are allowed.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const bodySchema = z.object({ key: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const guard = await requireStaffApi("catalog.read");
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED" } },
      { status: 422, headers: NO_STORE },
    );
  }
  try {
    const image = await completeDirectUpload(guard.staff, parsed.data, await getRequestMeta());
    return NextResponse.json(image, { headers: NO_STORE });
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
