import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { getReturnStart } from "@/modules/returns/returns.service";
import { forPage } from "../../page-guard";
import { NewReturnForm } from "./new-return-form";

export const metadata = { title: "New return" };

/** Staff open a return or exchange for a customer who phoned or came in. */
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const staff = await requireStaffPage("return.manage");
  const { order: orderId } = await searchParams;
  const start = await forPage(getReturnStart(staff, orderId ?? ""));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/admin/orders/${start.order.id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {start.order.orderNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Return or exchange</h1>
      {start.insideWindow ? null : (
        <p className="mt-3 rounded-md border border-accent bg-accent/30 px-4 py-3 text-sm">
          The {start.windowDays}-day return window has passed. You can still accept it, with a note
          saying why.
        </p>
      )}
      <NewReturnForm
        orderId={start.order.id}
        insideWindow={start.insideWindow}
        items={start.items}
      />
    </div>
  );
}
