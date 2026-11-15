import Link from "next/link";

import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { getCodWorkspace } from "@/modules/orders/cod-settlement.service";
import { getOrderSettings } from "@/modules/settings/settings.service";
import { COURIER_LABELS } from "@/modules/settings/order-settings";
import { forPage } from "../../page-guard";
import { dhaka } from "../order-ui";
import { CodForm } from "./cod-form";

export const metadata = { title: "Courier cash" };

/**
 * Recording money a courier paid for delivered cash-on-delivery orders.
 * Orders paid in full become PAID; short ones stay unpaid and every
 * mismatch is kept on the settlement.
 */
export default async function CodPage() {
  const staff = await requireStaffPage("order.cod.reconcile");
  const [workspace, settings] = await Promise.all([
    forPage(getCodWorkspace(staff)),
    getOrderSettings(),
  ]);
  const courierLabel = (key: string | null, name: string | null) =>
    name ?? (key === null ? "—" : (COURIER_LABELS[key as keyof typeof COURIER_LABELS] ?? key));

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
        ← Orders
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Courier cash</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick the delivered orders a courier has paid for, then enter what arrived and what the
        courier kept as charges.
      </p>

      <CodForm
        couriers={settings.couriers.map((key) => ({ key, label: COURIER_LABELS[key] }))}
        orders={workspace.unsettled.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          deliveredAt: order.deliveredAt === null ? null : dhaka(order.deliveredAt),
          courier: order.courier,
          courierText: courierLabel(order.courier, order.courierName),
          trackingCode: order.trackingCode,
          expectedPoisha: order.expectedPoisha,
        }))}
      />

      <h2 className="mt-10 text-lg font-semibold">Recorded settlements</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[48rem] text-sm" data-testid="settlements">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Reference</th>
              <th className="px-4 py-2.5 font-medium">Courier</th>
              <th className="px-4 py-2.5 font-medium">Orders</th>
              <th className="px-4 py-2.5 text-right font-medium">Expected</th>
              <th className="px-4 py-2.5 text-right font-medium">Received + charge</th>
              <th className="px-4 py-2.5 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {workspace.settlements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing recorded yet.
                </td>
              </tr>
            ) : (
              workspace.settlements.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {row.reference}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.receivedOn.toISOString().slice(0, 10)}
                      {row.courierReference === null ? "" : ` · ${row.courierReference}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">{courierLabel(row.courier, row.courierName)}</td>
                  <td className="px-4 py-3 text-xs">
                    {row.items.map((item) => (
                      <Link
                        key={item.id}
                        className="me-2 underline"
                        href={`/admin/orders/${item.order.id}`}
                      >
                        {item.order.orderNumber}
                      </Link>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(row.expectedPoisha, "en")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(row.receivedPoisha, "en")} +{" "}
                    {formatMoney(row.courierChargePoisha, "en")}
                  </td>
                  <td
                    className={
                      row.differencePoisha === 0
                        ? "px-4 py-3 text-right tabular-nums"
                        : "px-4 py-3 text-right font-semibold text-destructive tabular-nums"
                    }
                  >
                    {formatMoney(row.differencePoisha, "en")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
