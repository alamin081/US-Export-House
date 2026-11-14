import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { listTransferLocationOptions } from "@/modules/inventory/transfer.service";
import { TransferDraftForm } from "../transfer-draft-form";

export const metadata = { title: "New transfer" };

export default async function NewTransferPage() {
  const staff = await requireStaffPage("transfer.create");
  const locations = await listTransferLocationOptions(staff);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/transfers" className="text-sm text-muted-foreground hover:underline">
        ← Transfers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New transfer</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Saved as a draft. Stock leaves the sending location only when it is dispatched.
      </p>
      <TransferDraftForm locations={locations} />
    </div>
  );
}
