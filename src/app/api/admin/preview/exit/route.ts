import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

import { PREVIEW_AT_COOKIE } from "@/modules/content/content.storefront";

/** Ends a draft preview and returns to the live home page. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  (await draftMode()).disable();
  const response = NextResponse.redirect(new URL("/", request.url), 307);
  response.cookies.delete(PREVIEW_AT_COOKIE);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
