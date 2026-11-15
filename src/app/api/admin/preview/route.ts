import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

import { requireStaffApi } from "@/modules/access/api-guard";
import { getContentForEdit } from "@/modules/content/content.service";
import { PREVIEW_AT_COOKIE } from "@/modules/content/content.storefront";

/**
 * Starts a draft preview for staff with content.write: turns on Next.js draft
 * mode and sends the browser to the page the document appears on. The target
 * comes from the document itself, never from the query string, so this cannot
 * be used as an open redirect. The storefront shows drafts only while draft
 * mode is on AND a staff session with content.write is present.
 *
 *   /api/admin/preview?key=page.about&locale=en&at=2026-04-14T00:00
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireStaffApi("content.write");
  if ("response" in guard) return guard.response;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "home";
  let path: string;
  try {
    const document = await getContentForEdit(guard.staff, key);
    path = document.path ?? "/";
  } catch {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const locale = url.searchParams.get("locale") === "en" ? "en" : "bn";
  const target = locale === "en" ? `/en${path === "/" ? "" : path}` : path;
  (await draftMode()).enable();
  const response = NextResponse.redirect(new URL(target, url.origin), 307);
  response.headers.set("cache-control", "private, no-store");
  const at = url.searchParams.get("at") ?? "";
  if (at !== "" && !Number.isNaN(Date.parse(at))) {
    response.cookies.set(PREVIEW_AT_COOKIE, new Date(at).toISOString(), {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
    });
  } else {
    response.cookies.delete(PREVIEW_AT_COOKIE);
  }
  return response;
}
