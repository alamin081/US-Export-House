import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 *
 * Right now this only performs locale negotiation for the storefront. The
 * `/admin` authentication guard will be added here in Phase 5; it stays a cheap
 * gate only - every real permission and branch-access check happens again in
 * the service layer.
 */
export default createMiddleware(routing);

export const config = {
  // Match everything except API routes, Next internals, Vercel internals and
  // any path that looks like a file (e.g. favicon.ico, /images/shirt.webp).
  matcher: "/((?!api|admin|_next|_vercel|.*\\..*).*)",
};
