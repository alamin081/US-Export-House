import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Audit log" };

export default function AuditlogPage() {
  return (
    <AdminPlaceholder
      title="Audit log"
      phase={12}
      description={
        "Every sensitive action: price changes, stock adjustments, transfers, refunds, role and setting changes."
      }
      layout="table"
      features={[
        "Who did what, when, and from which location",
        "Before and after values",
        "Filter by user, action type and date",
        "Append-only: entries are never edited or deleted",
      ]}
    />
  );
}
