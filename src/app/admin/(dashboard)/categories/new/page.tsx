import { CategoryEditorPage } from "../category-editor-page";

export const metadata = { title: "New category" };

export default function NewCategoryPage() {
  return <CategoryEditorPage categoryId={null} />;
}
