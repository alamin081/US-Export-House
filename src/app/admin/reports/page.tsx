import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <AdminPlaceholder
      title="Reports"
      phase={12}
      description={"Sales, stock and operations reporting by date, channel and location."}
      layout="cards"
      features={[
        "Sales by date, channel and location",
        "Stock value and low stock per location",
        "Transfers and adjustments",
        "Top products and coupon usage",
        "COD collection and settlement",
        "CSV export for every report",
      ]}
    />
  );
}
