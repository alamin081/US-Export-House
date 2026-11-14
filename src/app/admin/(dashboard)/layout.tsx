import { listAccessibleLocations, requireStaffPage } from "@/modules/access/access.service";
import { AdminShell } from "./admin-shell";
import { navForPermissions } from "./admin-nav";

/**
 * Guarded admin area. Every page below this layout requires a valid staff
 * session (checked against the database on each request); pages add their
 * own permission on top.
 */
export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  const locations = await listAccessibleLocations(staff);

  return (
    <AdminShell
      staff={{ name: staff.name, email: staff.email, roleName: staff.roleName }}
      nav={navForPermissions(staff.permissions)}
      locations={locations.map((location) => ({
        id: location.id,
        code: location.code,
        nameEn: location.nameEn,
      }))}
      allLocations={staff.allLocations}
    >
      {children}
    </AdminShell>
  );
}
