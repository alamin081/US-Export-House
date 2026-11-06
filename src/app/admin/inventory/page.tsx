import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <AdminPlaceholder
      title="Inventory"
      phase={7}
      description={
        "Stock per variant per location, with the full movement ledger behind every number."
      }
      layout="table"
      features={[
        "On-hand and reserved stock for every location",
        "One row per variant, all locations side by side",
        "Manual adjustments with a mandatory reason",
        "Low-stock thresholds per variant and location",
        "Physical stock count with discrepancy report",
        "CSV import for opening stock",
      ]}
    />
  );
}
