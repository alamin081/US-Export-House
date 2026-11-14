import type { StaffContext } from "@/modules/access/authorization";

/**
 * Auth.js type augmentation.
 *
 * - `Session.staff` is the validated staff context (null when the session is
 *   no longer valid). It never contains the session token.
 * - `User.sessionToken` only exists between `authorize()` and the `jwt`
 *   callback, which moves it into the encrypted cookie.
 */
declare module "next-auth" {
  interface Session {
    staff: StaffContext | null;
  }

  interface User {
    sessionToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
  }
}
