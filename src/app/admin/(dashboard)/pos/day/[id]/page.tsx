import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getDay } from "@/modules/pos/pos.service";
import { forPage } from "../../../page-guard";
import { dhaka } from "../../../orders/order-ui";
import { CloseDayForm } from "./close-day-form";

export const metadata = { title: "Till day" };
export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BKASH: "bKash",
  NAGAD: "Nagad",
  BANK_TRANSFER: "Bank transfer",
};

/** One till day: its bills and figures; closing it counts the drawer and locks the day. */
export default async function TillDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("pos.sell");
  const { session, report, sales, canClose } = await forPage(getDay(staff, id));

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/pos" className="text-sm text-muted-foreground hover:underline">
        ← Till
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{session.reference}</h1>
        <Badge variant={session.status === "OPEN" ? "accent" : "outline"} data-testid="day-status">
          {session.status === "OPEN" ? "Open" : "Closed"}
        </Badge>
        <a
          className="ms-auto text-sm underline"
          href={`/admin/print/pos/z-report/${session.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Print {session.status === "OPEN" ? "X" : "Z"}-report
        </a>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        {session.location.code} · counter {session.counterCode} · opened {dhaka(session.openedAt)}
        {session.closedAt === null ? "" : ` · closed ${dhaka(session.closedAt)}`}
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-4" data-testid="day-figures">
        {[
          ["Bills", String(report.bills)],
          ["Net sales", formatMoney(report.netSalesPoisha, "en")],
          ["Discounts", formatMoney(report.discountPoisha, "en")],
          ["Refunds", formatMoney(report.refundsPoisha, "en")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-background p-4 text-sm">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">
            By payment method
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {Object.entries(report.paymentsByMethod).map(([method, amount]) => (
              <li key={method} className="flex justify-between">
                <span>{METHOD_LABELS[method] ?? method}</span>
                <span className="tabular-nums">{formatMoney(amount, "en")}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-background p-4 text-sm">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">Cash drawer</h2>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-1">
            <dt>Opening float</dt>
            <dd className="tabular-nums">{formatMoney(report.openingFloatPoisha, "en")}</dd>
            <dt>+ cash sales</dt>
            <dd className="tabular-nums">{formatMoney(report.cashSalesPoisha, "en")}</dd>
            <dt>− cash refunds</dt>
            <dd className="tabular-nums">{formatMoney(report.cashRefundsPoisha, "en")}</dd>
            <dt className="font-semibold">Expected</dt>
            <dd className="font-semibold tabular-nums" data-testid="expected-cash">
              {formatMoney(report.expectedCashPoisha, "en")}
            </dd>
            {session.countedCashPoisha === null ? null : (
              <>
                <dt>Counted</dt>
                <dd className="tabular-nums">{formatMoney(session.countedCashPoisha, "en")}</dd>
                <dt>Difference</dt>
                <dd className="tabular-nums">{formatMoney(session.differencePoisha ?? 0, "en")}</dd>
              </>
            )}
          </dl>
          {session.differenceReason === null ? null : (
            <p className="mt-2 text-xs text-muted-foreground">Reason: {session.differenceReason}</p>
          )}
        </section>
      </div>

      {canClose ? <CloseDayForm sessionId={session.id} /> : null}

      <h2 className="mt-8 text-lg font-semibold">Bills</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {sales.map((sale) => (
          <li key={sale.id} className="flex justify-between gap-2">
            <Link className="tabular-nums underline" href={`/admin/orders/${sale.id}`}>
              {sale.invoices[0]?.number ?? sale.orderNumber}
            </Link>
            <span className="text-muted-foreground">{dhaka(sale.placedAt)}</span>
            <span className="tabular-nums">{formatMoney(sale.totalPoisha, "en")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
