import { requireStaffPage } from "@/modules/access/access.service";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Stock transfers" };

export default async function StocktransfersPage() {
  await requireStaffPage("transfer.create");

  return (
    <AdminPlaceholder
      title="Stock transfers"
      phase={7}
      description={"Move stock between branches and warehouses, with dispatch and receive steps."}
      layout="table"
      features={[
        "Draft, dispatched, received and cancelled states",
        "Partial receive recorded as a discrepancy",
        "Who created, dispatched and received each transfer",
        "Ledger entries on both sides (TRANSFER_OUT / TRANSFER_IN)",
      ]}
    />
  );
}
