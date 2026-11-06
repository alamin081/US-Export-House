import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <AdminPlaceholder
      title="Categories"
      phase={6}
      description={"Category tree, bilingual names and slugs, and the order products appear in."}
      layout="table"
      features={[
        "Nested categories with drag-to-reorder",
        "Bilingual name, slug and description",
        "Category image and banner",
        "Soft delete when a category has history",
      ]}
    />
  );
}
