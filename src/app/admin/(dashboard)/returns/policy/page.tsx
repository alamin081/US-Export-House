import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/modules/access/access.service";
import { getReturnPolicyStatus } from "@/modules/returns/returns.service";
import { forPage } from "../../page-guard";
import { dhaka } from "../../orders/order-ui";
import { PolicyToggle } from "./policy-toggle";

export const metadata = { title: "Return policy" };

/**
 * Approving and publishing the return policy. Until it is published, checkout
 * and order tracking do not link to it and search engines do not index it.
 */
export default async function ReturnPolicyPage() {
  const staff = await requireStaffPage("return.policy.publish");
  const status = await forPage(getReturnPolicyStatus(staff));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/returns" className="text-sm text-muted-foreground hover:underline">
        ← Returns
      </Link>
      <header className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Return policy</h1>
        <Badge variant={status.published ? "success" : "outline"} data-testid="policy-status">
          {status.published ? "Published" : "Not published"}
        </Badge>
      </header>
      <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-[14rem_1fr]">
        <dt className="text-muted-foreground">Return window</dt>
        <dd>{status.settings.windowDays} days after delivery</dd>
        <dt className="text-muted-foreground">Conditions</dt>
        <dd>
          {status.settings.conditionsEn}
          <span className="block">{status.settings.conditionsBn}</span>
        </dd>
        <dt className="text-muted-foreground">Delivery charge refunded</dt>
        <dd>
          {status.settings.refundShippingOnFault ? "Only for a defective or wrong item" : "Never"}
        </dd>
        <dt className="text-muted-foreground">Exchange delivery paid by</dt>
        <dd>
          {status.settings.exchangeShippingPaidBy === "CUSTOMER"
            ? "The customer (the shop pays on its own fault)"
            : "The shop"}
        </dd>
        {status.publishedAt === null ? null : (
          <>
            <dt className="text-muted-foreground">Published</dt>
            <dd>{dhaka(status.publishedAt)}</dd>
          </>
        )}
      </dl>
      <p className="mt-6 text-sm">
        <a className="underline" href="/shipping-returns" target="_blank" rel="noreferrer">
          Read the page as customers will see it
        </a>
        . Its text is edited with the content tools (Phase 12).
      </p>
      <PolicyToggle published={status.published} />
    </div>
  );
}
