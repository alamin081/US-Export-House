import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <AdminPlaceholder
      title="Customers"
      phase={9}
      description={"Customer records, order history and saved addresses."}
      layout="table"
      features={[
        "Phone number as the identity, in E.164 form",
        "Guest orders linked when an account is created",
        "Order and return history per customer",
        "Saved addresses with delivery zone",
      ]}
    />
  );
}
