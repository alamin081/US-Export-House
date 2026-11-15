import Link from "next/link";
import { Fragment } from "react";

import { requireStaffPage } from "@/modules/access/access.service";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  SENSITIVE_PERMISSIONS,
} from "@/modules/access/permissions";
import { listRolesForEdit } from "@/modules/access/role.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Roles" };
export const dynamic = "force-dynamic";

/** Roles and the permission matrix (Phase 12). Super Admin only. */
export default async function RolesPage() {
  const staff = await requireStaffPage("role.manage");
  const roles = await forPage(listRolesForEdit(staff));

  return (
    <div className="mx-auto max-w-[90rem]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles and permissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Super Admin always has everything. You cannot edit your own role.{" "}
            <span lang="bn">সুপার অ্যাডমিনের সব অনুমতি থাকে; নিজের রোল নিজে বদলানো যায় না।</span>
          </p>
        </div>
        <Link
          href="/admin/roles/new"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          data-testid="new-role"
        >
          New role
        </Link>
      </header>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map((role) => (
          <li key={role.id}>
            <Link
              href={`/admin/roles/${role.id}`}
              className="block h-full rounded-lg border border-border bg-background p-4 hover:border-foreground/30"
              data-testid={`role-${role.name}`}
            >
              <span className="text-sm font-semibold">{role.name}</span>
              <span className="ms-2 text-xs text-muted-foreground">
                {role.isSystem ? "System" : "Custom"}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {role.staffCount} staff ·{" "}
                {role.allLocations ? "all locations" : "assigned locations"} ·{" "}
                {role.permissions.length} permissions
                {role.locked ? " · locked" : role.isOwn ? " · your role" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section
        className="mt-8 overflow-x-auto rounded-lg border border-border bg-background"
        aria-label="Permission matrix"
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="sticky left-0 bg-background px-3 py-2 font-medium">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className="px-2 py-2 text-center font-medium whitespace-nowrap"
                >
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-secondary/50">
                  <th
                    colSpan={roles.length + 1}
                    scope="colgroup"
                    className="px-3 py-1.5 text-left font-semibold"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.keys.map((key) => (
                  <tr key={key} className="border-b border-border/60">
                    <th
                      scope="row"
                      className="sticky left-0 bg-background px-3 py-1.5 text-left font-normal"
                    >
                      <code
                        className={
                          SENSITIVE_PERMISSIONS.includes(key)
                            ? "text-red-700 dark:text-red-400"
                            : ""
                        }
                      >
                        {key}
                      </code>
                      <span className="block text-muted-foreground">
                        {PERMISSION_DESCRIPTIONS[key].en}
                      </span>
                      <span lang="bn" className="block text-muted-foreground">
                        {PERMISSION_DESCRIPTIONS[key].bn}
                      </span>
                    </th>
                    {roles.map((role) => (
                      <td key={role.id} className="px-2 py-1.5 text-center">
                        {role.permissions.includes(key) ? (
                          <span aria-label="yes">✓</span>
                        ) : (
                          <span className="text-muted-foreground/40" aria-label="no">
                            ·
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
