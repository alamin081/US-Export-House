import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <AdminPlaceholder
      title="Products"
      phase={6}
      description={
        "The central product catalogue: one list shared by every branch, warehouse and the website."
      }
      layout="table"
      features={[
        "Bilingual product copy (English required, Bengali optional)",
        "Variants by size and colour, each with its own SKU and barcode",
        "Image upload and ordering",
        "Prices in poisha, with an optional compare-at price",
        "Draft and published states, soft delete",
        "Size chart per product",
      ]}
    />
  );
}
