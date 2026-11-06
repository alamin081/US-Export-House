import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Locations" };

export default function LocationsPage() {
  return (
    <AdminPlaceholder
      title="Locations"
      phase={7}
      description={"Branches and warehouses, and which of them fulfil online orders."}
      layout="table"
      features={[
        "Branch or warehouse, with address and phone",
        "Active or inactive, never deleted once it has history",
        "Online fulfilment flag and the default online location",
        "Per-location opening hours for the storefront",
      ]}
    />
  );
}
