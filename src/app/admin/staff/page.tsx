import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Staff & roles" };

export default function StaffrolesPage() {
  return (
    <AdminPlaceholder
      title="Staff & roles"
      phase={5}
      description={
        "Staff accounts, roles and the locations each person may see. Only a Super Admin can create staff."
      }
      layout="table"
      features={[
        "Email and password sign-in (Argon2id), database sessions",
        "Roles built from permission keys",
        "Per-staff location access, enforced in the service layer",
        "Revoke a session immediately",
        "Role changes written to the audit log",
      ]}
    />
  );
}
