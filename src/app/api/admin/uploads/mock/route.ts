import { NextResponse, type NextRequest } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { getRequestMeta } from "@/modules/access/access.service";
import { uploadMockImage } from "@/modules/media/media.service";

/**
 * MOCK STORAGE upload (development only). The file is checked on the server
 * (MIME type and file signature, size limit) before anything is written; the
 * stored name is generated, never taken from the upload.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  const guard = await requireStaffApi("catalog.read");
  if ("response" in guard) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "No file." } },
      { status: 422, headers: NO_STORE },
    );
  }

  try {
    const image = await uploadMockImage(
      guard.staff,
      { declaredMime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
      await getRequestMeta(),
    );
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
