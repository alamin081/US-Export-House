import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "In-store sale" };

export default function InstoresalePage() {
  return (
    <AdminPlaceholder
      title="In-store sale"
      phase={9}
      description={
        "A simple till for branch staff: scan or type a SKU, take payment, stock drops immediately."
      }
      layout="form"
      features={[
        "Add items by SKU or barcode",
        "Cash, card or mobile banking recorded against the sale",
        "Stock deducted at the selling branch (SALE_STORE)",
        "Printed or emailed receipt",
        "Only the branches a staff member has access to",
      ]}
    />
  );
}
