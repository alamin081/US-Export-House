import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { PERMISSION_GROUPS } from "@/modules/access/permissions";
import { getStaffOverview } from "@/modules/access/staff.service";
import { CreateStaffForm } from "./create-staff-form";
import { StaffRowActions } from "./staff-row-actions";

export const metadata = { title: "Staff & roles" };

/**
 * Staff and role management. Only `staff.manage` (Super Admin) reaches it, and
 * every action re-checks that permission in the service.
 */
export default async function StaffPage() {
  const actor = await requireStaffPage("staff.manage");
  const { staff, roles, locations } = await getStaffOverview(actor);

  const roleOptions = roles.map((role) => ({
    id: role.id,
    name: role.name,
    allLocations: role.allLocations,
  }));
  const locationOptions = locations.map((location) => ({
    id: location.id,
    label: `${location.nameEn} (${location.code})`,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Staff & roles</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Create staff accounts, choose their role and the branches or warehouses they work in.
          Changes take effect on the staff member&apos;s next request.
        </p>
      </header>

      {/* Staff list */}
      <section className="mt-8 rounded-lg border border-border bg-background">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Staff accounts ({staff.length})</h2>
        </header>

        <ul className="divide-y divide-border">
          {staff.map((member) => (
            <li key={member.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {member.name ?? "—"}
                    {member.isSelf ? <Badge variant="outline">You</Badge> : null}
                    {member.isActive ? null : <Badge variant="destructive">Deactivated</Badge>}
                    {member.hasPassword ? null : <Badge variant="muted">No password</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p>
                  <p className="mt-2 text-xs">
                    <span className="font-medium">{member.role?.name ?? "No role"}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {member.role?.allLocations
                        ? "All locations"
                        : member.locations.length === 0
                          ? "No locations"
                          : member.locations.map((location) => location.nameEn).join(", ")}
                    </span>
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd className="tabular-nums">
                    {member.lastLogin === null ? "Never" : formatDateTime(member.lastLogin, "en")}
                  </dd>
                  <dt className="text-muted-foreground">Active sessions</dt>
                  <dd className="tabular-nums">{member.activeSessions}</dd>
                </dl>
              </div>

              {member.isSelf ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your own role, status and password are managed from{" "}
                  <Link href="/admin/account" className="underline underline-offset-4">
                    My account
                  </Link>
                  , so you cannot lock yourself out here.
                </p>
              ) : (
                <StaffRowActions
                  member={{
                    id: member.id,
                    email: member.email ?? "",
                    isActive: member.isActive,
                    roleId: member.role?.id ?? "",
                    locationIds: member.locations.map((location) => location.id),
                  }}
                  roles={roleOptions}
                  locations={locationOptions}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Create */}
      <section className="mt-8 rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold">Add a staff member</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set a temporary password and share it privately; they can change it under My account.
        </p>
        <div className="mt-5">
          <CreateStaffForm roles={roleOptions} locations={locationOptions} />
        </div>
      </section>

      {/* Role matrix */}
      <section className="mt-8 rounded-lg border border-border bg-background">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Roles and permissions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The seven system roles. Editing role permissions is planned for the Settings phase.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-3 font-medium">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.id} scope="col" className="px-3 py-3 text-center font-medium">
                    <span className="block whitespace-nowrap">{role.name}</span>
                    <span className="block font-normal text-muted-foreground">
                      {role.allLocations ? "all locations" : "assigned only"} · {role.staffCount}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <PermissionGroupRows key={group.label} group={group} roles={roles} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PermissionGroupRows({
  group,
  roles,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
}) {
  return (
    <>
      <tr className="bg-secondary/50">
        <th
          scope="colgroup"
          colSpan={roles.length + 1}
          className="px-4 py-2 text-left text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase"
        >
          {group.label}
        </th>
      </tr>
      {group.keys.map((key) => (
        <tr key={key} className="border-t border-border">
          <th scope="row" className="px-4 py-2 text-left font-normal">
            <code>{key}</code>
          </th>
          {roles.map((role) => (
            <td key={role.id} className="px-3 py-2 text-center">
              {role.permissions.includes(key) ? (
                <Check aria-label="Granted" className="mx-auto size-3.5" />
              ) : (
                <Minus aria-label="Not granted" className="mx-auto size-3.5 text-border" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
