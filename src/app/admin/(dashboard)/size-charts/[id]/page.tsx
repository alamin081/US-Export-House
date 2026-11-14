import { SizeChartEditorPage } from "../size-chart-editor-page";

export const metadata = { title: "Edit size chart" };

export default async function EditSizeChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SizeChartEditorPage sizeChartId={id} />;
}
