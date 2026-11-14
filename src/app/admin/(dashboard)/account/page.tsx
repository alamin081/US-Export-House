import { formatDateTime } from "@/lib/datetime";
import { listAccessibleLocations, requireStaffPage } from "@/modules/access/access.service";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "My account" };

/** Any signed-in staff member: own details, access summary, password change. */
export default async function AccountPage() {
  const staff = await requireStaffPage();
  const locations = await listAccessibleLocations(staff);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">My account</h1>

      <section className="mt-8 rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold">Your access</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{staff.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{staff.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{staff.roleName}</dd>
          <dt className="text-muted-foreground">Locations</dt>
          <dd>
            {staff.allLocations
              ? "All locations"
              : locations.length === 0
                ? "None assigned"
                : locations.map((location) => location.nameEn).join(", ")}
          </dd>
          <dt className="text-muted-foreground">Session ends</dt>
          <dd className="tabular-nums">{formatDateTime(staff.sessionExpiresAt, "en")}</dd>
        </dl>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold">Change password</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your other devices are signed out when the password changes.
        </p>
        <div className="mt-5">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
