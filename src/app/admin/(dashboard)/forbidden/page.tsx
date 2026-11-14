import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { isPermissionKey } from "@/modules/access/permissions";

export const metadata = { title: "No access" };

/**
 * Shown when a signed-in staff member opens a page their role does not allow.
 * (Next.js `forbidden()` is still experimental, so this is a plain page.)
 */
export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage();
  const query = await searchParams;
  const raw = Array.isArray(query.need) ? query.need[0] : query.need;
  const permission = raw !== undefined && isPermissionKey(raw) ? raw : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <ShieldAlert aria-hidden="true" className="size-10 text-muted-foreground" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">You do not have access</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your role, <span className="font-medium text-foreground">{staff.roleName}</span>, does not
        include this section
        {permission === null ? (
          ""
        ) : (
          <>
            {" "}
            (needs <code className="text-xs">{permission}</code>)
          </>
        )}
        . Ask a Super Admin if you need it.
      </p>
      <Link href="/admin" className={`${buttonVariants({ variant: "outline" })} mt-8`}>
        Back to dashboard
      </Link>
    </div>
  );
}
