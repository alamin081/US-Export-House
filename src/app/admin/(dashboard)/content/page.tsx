import { requireStaffPage } from "@/modules/access/access.service";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Content" };

export default async function ContentPage() {
  await requireStaffPage("content.write");

  return (
    <AdminPlaceholder
      title="Content"
      phase={12}
      description={"Banners, home sections, menus and policy pages — all bilingual."}
      layout="table"
      features={[
        "Hero and promotional banners with schedule",
        "Home section order",
        "Policy pages with draft and published states",
        "Menu items for header and footer",
        "Bengali optional, English required",
      ]}
    />
  );
}
