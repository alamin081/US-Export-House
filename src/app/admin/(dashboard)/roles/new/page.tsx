import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { SUPER_ADMIN_ONLY } from "@/modules/access/permissions";
import { getRoleForEdit } from "@/modules/access/role.service";
import { forPage } from "../../page-guard";
import { permissionGroupsForForm } from "../permission-groups";
import { RoleForm } from "../role-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New role" };

/** A new custom role, empty or copied from another (?copy=<id>). */
export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string }>;
}) {
  const staff = await requireStaffPage("role.manage");
  const { copy } = await searchParams;
  const source = copy === undefined ? null : await forPage(getRoleForEdit(staff, copy));
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/roles"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Roles
      </Link>
      <h1 className="mt-3 mb-4 text-2xl font-semibold tracking-tight">
        {source === null ? "New role" : `New role from “${source.name}”`}
      </h1>
      <RoleForm
        roleId={null}
        initial={{
          name: source === null ? "" : `${source.name} (copy)`,
          description: source?.description ?? "",
          permissions: (source?.permissions ?? []).filter((key) => !SUPER_ADMIN_ONLY.includes(key)),
          allLocations: source?.allLocations ?? false,
          updatedAt: new Date(0).toISOString(),
        }}
        groups={permissionGroupsForForm()}
        isSystem={false}
        staffCount={0}
        readOnlyReason={null}
      />
    </div>
  );
}
