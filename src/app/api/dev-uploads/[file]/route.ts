import { NextResponse } from "next/server";

import { isMockStorage } from "@/integrations/storage";
import { readMockUpload } from "@/integrations/storage/local-mock.storage";

/**
 * Serves MOCK STORAGE files (development and tests only). Answers 404 when a
 * real provider is configured, and only for names the mock itself generated.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  if (!isMockStorage()) return new NextResponse(null, { status: 404 });
  const { file } = await context.params;
  const bytes = await readMockUpload(file);
  if (bytes === null) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": CONTENT_TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
