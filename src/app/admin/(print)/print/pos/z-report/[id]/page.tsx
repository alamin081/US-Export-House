import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getDay } from "@/modules/pos/pos.service";
import { forPage } from "../../../../../(dashboard)/page-guard";
import { PrintButton } from "../../../../transfers/[id]/print/print-button";

export const metadata = { title: "Z-report" };
export const dynamic = "force-dynamic";

/** End-of-day report on receipt paper: Z once closed, X (interim) while open. */
export default async function ZReportPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("pos.sell");
  const { id } = await params;
  const { session, report } = await forPage(getDay(staff, id));
  const money = (poisha: number) => formatMoney(poisha, "en");
  const rows: Array<[string, string]> = [
    ["Bills", String(report.bills)],
    ["Gross sales", money(report.grossPoisha)],
    ["Discounts", money(report.discountPoisha)],
    ["Net sales", money(report.netSalesPoisha)],
    ...Object.entries(report.paymentsByMethod).map(
      ([method, amount]) => [`  ${method}`, money(amount)] as [string, string],
    ),
    ["Refunds", money(report.refundsPoisha)],
    ...Object.entries(report.refundsByMethod).map(
      ([method, amount]) => [`  ${method}`, money(amount)] as [string, string],
    ),
    ["Opening float", money(report.openingFloatPoisha)],
    ["Expected cash", money(report.expectedCashPoisha)],
  ];
  if (session.countedCashPoisha !== null) {
    rows.push(["Counted cash", money(session.countedCashPoisha)]);
    rows.push(["Difference", money(session.differencePoisha ?? 0)]);
  }
  return (
    <main
      className="mx-auto w-[76mm] bg-white p-2 font-mono text-[11px] text-black"
      data-testid="z-report"
    >
      <style>{"@page { size: 80mm auto; margin: 2mm; }"}</style>
      <div className="mb-2 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <p className="text-center text-sm font-bold">
        {session.status === "OPEN" ? "X-REPORT (day open)" : "Z-REPORT"}
      </p>
      <p className="text-center">{session.reference}</p>
      <p className="text-center">
        {session.location.code} · {session.counterCode}
      </p>
      <hr className="my-1 border-dashed border-black" />
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between whitespace-pre">
          <span>{label}</span>
          <span>{value}</span>
        </p>
      ))}
      {session.differenceReason === null ? null : (
        <p className="mt-1">Reason: {session.differenceReason}</p>
      )}
    </main>
  );
}
