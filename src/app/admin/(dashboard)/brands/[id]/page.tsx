import { BrandEditorPage } from "../brand-editor-page";

export const metadata = { title: "Edit brand" };

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandEditorPage brandId={id} />;
}
