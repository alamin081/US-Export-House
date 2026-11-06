import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Shipments" };

export default function ShipmentsPage() {
  return (
    <AdminPlaceholder
      title="Shipments"
      phase={11}
      description={
        "Courier bookings and delivery status. Runs in mock mode until Steadfast credentials arrive."
      }
      layout="table"
      features={[
        "Book a consignment from a packed order",
        "Consignment id and COD amount per shipment",
        "Status from webhook, with hourly polling as a fallback",
        "A clear MOCK badge whenever no real booking was made",
        "Ready for Pathao and RedX behind the same interface",
      ]}
    />
  );
}
