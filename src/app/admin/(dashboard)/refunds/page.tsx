import Link from "next/link";

import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { listPendingRefundsForStaff } from "@/modules/returns/refund.service";
import { REFUND_METHOD_LABELS } from "@/modules/returns/return-rules";
import { forPage } from "../page-guard";
import { dhaka } from "../orders/order-ui";
import { RefundDecision } from "./refund-decision";

export const metadata = { title: "Refunds to approve" };

/** Refunds above the approval limit wait here for refund.approve. */
export default async function RefundsPage() {
  const staff = await requireStaffPage("refund.approve");
  const refunds = await forPage(listPendingRefundsForStaff(staff));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Refunds to approve</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Refunds above the approval limit, recorded by staff who may not approve them.
      </p>
      {refunds.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing is waiting.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-testid="pending-refunds">
          {refunds.map((refund) => (
            <li
              key={refund.id}
              className="rounded-lg border border-border bg-background p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium tabular-nums">
                    {formatMoney(refund.amountPoisha, "en")} ·{" "}
                    {REFUND_METHOD_LABELS[refund.method as keyof typeof REFUND_METHOD_LABELS] ??
                      refund.method}
                    {refund.reference === null ? "" : ` · ${refund.reference}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Link className="underline" href={`/admin/orders/${refund.order.id}`}>
                      {refund.order.orderNumber}
                    </Link>{" "}
                    · {refund.order.customerName}
                    {refund.returnRequest === null ? null : (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          className="underline"
                          href={`/admin/returns/${refund.returnRequest.id}`}
                        >
                          {refund.returnRequest.reference}
                        </Link>
                      </>
                    )}{" "}
                    · {dhaka(refund.createdAt)}
                  </p>
                </div>
                <RefundDecision refundId={refund.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
