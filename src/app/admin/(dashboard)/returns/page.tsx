import { requireStaffPage } from "@/modules/access/access.service";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Returns & refunds" };

export default async function ReturnsrefundsPage() {
  await requireStaffPage("return.manage");

  return (
    <AdminPlaceholder
      title="Returns & refunds"
      phase={9}
      description={
        "Return requests, inspection results, restocking and refund records. Policy still awaiting approval."
      }
      layout="table"
      features={[
        "Return window and conditions read from settings",
        "Approve, receive and inspect each item",
        "Restock to a chosen location, or write off as damaged",
        "Refund to the original method, bank transfer or MFS",
        "Every step written to the audit log",
      ]}
    />
  );
}
