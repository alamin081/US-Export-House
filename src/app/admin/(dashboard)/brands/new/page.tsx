import { BrandEditorPage } from "../brand-editor-page";

export const metadata = { title: "New brand" };

export default function NewBrandPage() {
  return <BrandEditorPage brandId={null} />;
}
