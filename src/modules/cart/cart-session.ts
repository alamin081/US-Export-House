import "server-only";

import { cookies } from "next/headers";

import { clientEnv, env } from "@/config/env";
import { getCheckoutSettings } from "@/modules/settings/settings.service";
import { CART_COOKIE, cartCookieValue, readCartCookie } from "./cart-token";

/**
 * The guest cart cookie: HTTP-only (scripts cannot read it), SameSite=Lax,
 * Secure whenever the site is served over HTTPS, signed with a key derived from
 * AUTH_SECRET. Readable anywhere on the server; written only from Server
 * Actions and Route Handlers.
 */

export async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return readCartCookie(store.get(CART_COOKIE)?.value, env.AUTH_SECRET);
}

export async function writeCartToken(token: string): Promise<void> {
  const { cartTtlDays } = await getCheckoutSettings();
  const store = await cookies();
  store.set(CART_COOKIE, cartCookieValue(token, env.AUTH_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: clientEnv.NEXT_PUBLIC_APP_URL.startsWith("https:"),
    path: "/",
    maxAge: cartTtlDays * 24 * 60 * 60,
  });
}

export async function clearCartToken(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
