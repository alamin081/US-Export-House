"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema, safeAdminCallback } from "./access.schema";
import { getCurrentStaff, getRequestMeta } from "./access.service";
import { endStaffSession } from "./auth.service";

/**
 * Staff sign-in and sign-out, as Server Actions. Next.js checks the Origin
 * header on every Server Action, which is the CSRF protection for these forms.
 */

export type LoginState = { error: null | "invalid" | "throttled" | "unavailable" };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeAdminCallback(formData.get("callbackUrl")),
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      // `code` comes from the CredentialsSignin subclasses in src/lib/auth.ts.
      const code = "code" in error ? (error as { code?: string }).code : undefined;
      if (code === "throttled") return { error: "throttled" };
      if (error.type === "CredentialsSignin") return { error: "invalid" };
      return { error: "unavailable" };
    }
    // Successful sign-in redirects by throwing; let it through.
    throw error;
  }
}

/**
 * Ends the database session first, so the audit row records the IP and user
 * agent, then clears the cookie. The Auth.js sign-out event still revokes by
 * token as a fallback, and finds nothing left to do here.
 */
export async function logoutAction(): Promise<void> {
  const staff = await getCurrentStaff();
  if (staff !== null) {
    await endStaffSession(staff.sessionId, await getRequestMeta());
  }
  await signOut({ redirectTo: "/admin/login" });
}
