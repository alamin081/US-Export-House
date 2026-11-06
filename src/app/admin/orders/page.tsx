import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <AdminPlaceholder
      title="Orders"
      phase={9}
      description={"Online and in-store orders, their payment state, and the fulfilling location."}
      layout="table"
      features={[
        "Status flow: pending, confirmed, processing, shipped, delivered",
        "Payment status tracked separately from order status",
        "Change the fulfilment location before processing",
        "Cancel before shipping, which releases the stock reservation",
        "Invoice and packing slip",
        "Filter by channel, location, status and date",
      ]}
    />
  );
}
