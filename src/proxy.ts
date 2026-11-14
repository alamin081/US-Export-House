import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Next.js 16 proxy (formerly middleware).
 *
 * - Storefront paths: locale negotiation (next-intl).
 * - /admin paths: a cheap gate. Without an Auth.js session cookie the visitor
 *   is sent to the sign-in page. This is deliberately NOT the access check —
 *   it never reads the database. The real check (valid, unrevoked session plus
 *   permission and location access) happens in the admin layout, every page,
 *   and again inside each service.
 */
const handleLocale = createMiddleware(routing);

// Auth.js names its cookie with a `__Secure-` prefix over HTTPS.
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => SESSION_COOKIE_NAMES.some((name) => cookie.name.startsWith(name)));
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login" || hasSessionCookie(request)) {
      return NextResponse.next();
    }

    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return handleLocale(request);
}

export const config = {
  // Everything except API routes, Next internals, Vercel internals and any
  // path that looks like a file (favicon.ico, /images/shirt.webp, …).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
