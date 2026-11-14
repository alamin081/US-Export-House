import "server-only";

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/config/env";
import { loginSchema } from "@/modules/access/access.schema";
import {
  authenticateStaff,
  revokeSessionToken,
  validateSessionToken,
} from "@/modules/access/auth.service";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import { NO_REQUEST_META } from "@/modules/audit/audit.service";

/**
 * Auth.js (NextAuth v5) configuration for staff sign-in.
 *
 * Why the session strategy says "jwt": Auth.js only allows the Credentials
 * provider with JWT sessions. The JWT here is a thin, encrypted envelope that
 * holds one thing — an opaque session token whose hash lives in the `Session`
 * table. Every request re-validates that row, so:
 *   - sign-out, deactivation and "revoke sessions" take effect immediately;
 *   - role and location changes apply on the very next request;
 *   - nothing about permissions is trusted from the cookie.
 *
 * Cookies are HTTP-only, SameSite=Lax, and Secure over HTTPS (Auth.js
 * defaults), and are encrypted with AUTH_SECRET.
 */

/** Surfaces to the sign-in form as `error.code`. */
class InvalidCredentialsError extends CredentialsSignin {
  override code = "invalid_credentials";
}

class ThrottledError extends CredentialsSignin {
  override code = "throttled";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  // The app sits behind Vercel (or Nginx later), which sets the Host header.
  trustHost: true,
  session: {
    strategy: "jwt",
    // The cookie may live as long as the absolute session lifetime; the idle
    // timeout and expiry are enforced by the Session row on every request.
    maxAge: env.STAFF_SESSION_MAX_AGE_HOURS * 60 * 60,
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Staff email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) throw new InvalidCredentialsError();

        const meta =
          request === undefined ? NO_REQUEST_META : requestMetaFromHeaders(request.headers);
        const result = await authenticateStaff(parsed.data, meta);

        if (!result.ok) {
          throw result.reason === "throttled"
            ? new ThrottledError()
            : new InvalidCredentialsError();
        }

        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          sessionToken: result.sessionToken,
        };
      },
    }),
  ],
  callbacks: {
    /** Keep the cookie minimal: the session token and the user id. */
    jwt({ token, user }) {
      if (user?.sessionToken !== undefined && user.id !== undefined) {
        return { sid: user.sessionToken, sub: user.id };
      }
      return token;
    },
    /**
     * Runs on every `auth()` call. The database decides whether the session is
     * still valid; the opaque token itself is never copied into the session
     * object that `/api/auth/session` returns to the browser.
     */
    async session({ session, token }) {
      const staff = typeof token.sid === "string" ? await validateSessionToken(token.sid) : null;
      return { ...session, user: undefined as never, staff };
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string") {
        await revokeSessionToken(message.token.sid, NO_REQUEST_META);
      }
    },
  },
  logger: {
    // Log the error class only. Auth.js errors can carry request details, and
    // nothing credential-shaped may reach the logs.
    error(error) {
      // A failed or throttled sign-in is expected and already in the audit log.
      if (error instanceof CredentialsSignin) return;
      console.error(`[auth] ${error instanceof Error ? error.name : "UnknownAuthError"}`);
    },
    warn(code) {
      console.warn(`[auth] warning: ${code}`);
    },
    debug() {
      // Debug output is never enabled.
    },
  },
});
