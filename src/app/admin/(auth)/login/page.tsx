import { redirect } from "next/navigation";

import { safeAdminCallback } from "@/modules/access/access.schema";
import { getCurrentStaff } from "@/modules/access/access.service";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/** Staff sign-in. Already signed-in staff go straight to the dashboard. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const callbackUrl = safeAdminCallback(
    Array.isArray(query.callbackUrl) ? query.callbackUrl[0] : query.callbackUrl,
  );

  if ((await getCurrentStaff()) !== null) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] uppercase">US Export House</p>
          <p className="mt-1 text-xs tracking-[0.22em] text-muted-foreground uppercase">
            Staff sign in
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background p-6 shadow-sm">
          <LoginForm callbackUrl={callbackUrl} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Staff accounts are created by a Super Admin. Customers sign in on the storefront.
        </p>
      </div>
    </main>
  );
}
