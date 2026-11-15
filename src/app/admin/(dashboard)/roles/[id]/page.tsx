import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { getRoleForEdit } from "@/modules/access/role.service";
import { forPage } from "../../page-guard";
import { permissionGroupsForForm } from "../permission-groups";
import { RoleForm } from "../role-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit role" };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("role.manage");
  const role = await forPage(getRoleForEdit(staff, id));
  const readOnlyReason = role.locked
    ? "The Super Admin role always has every permission. It cannot be edited."
    : role.isOwn
      ? "This is your own role. Another Super Admin must change it."
      : null;
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/roles"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Roles
      </Link>
      <h1 className="mt-3 mb-4 text-2xl font-semibold tracking-tight">{role.name}</h1>
      {role.unknownKeys.length === 0 ? null : (
        <p className="mb-4 text-sm text-amber-700">
          Ignored keys the app no longer knows: {role.unknownKeys.join(", ")}. Saving removes them.
        </p>
      )}
      <Link
        href={`/admin/roles/new?copy=${role.id}`}
        className="mb-4 inline-block text-sm underline underline-offset-4"
      >
        Copy this role into a new one
      </Link>
      <RoleForm
        roleId={role.id}
        initial={{
          name: role.name,
          description: role.description ?? "",
          permissions: role.permissions,
          allLocations: role.allLocations,
          updatedAt: role.updatedAt,
        }}
        groups={permissionGroupsForForm()}
        isSystem={role.isSystem}
        staffCount={role.staffCount}
        readOnlyReason={readOnlyReason}
      />
    </div>
  );
}
