import { AlertTriangle, ArrowUpRight, Banknote, Package, Receipt, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { getProducts } from "@/modules/catalog/catalog.mock";
import { MOCK_ORDERS } from "@/modules/orders/orders.mock";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";

/**
 * Admin dashboard — visual shell.
 *
 * PHASE 3: every figure below is derived from the sample orders in
 * `orders.mock.ts`, which is why the page says so at the top. Phase 12 replaces
 * these with real, location-scoped report queries.
 *
 * Every signed-in staff member may open the dashboard, but sales and stock
 * figures are only shown to roles holding `report.view`.
 */
export const metadata = { title: "Dashboard" };

const ADMIN_LOCALE = "en" as const;

export default async function AdminDashboardPage() {
  const staff = await requireStaffPage();

  if (!hasPermission(staff, "report.view")) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{staff.name === null ? "" : `, ${staff.name}`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <span className="font-medium text-foreground">{staff.roleName}</span>
          . Use the menu to open the sections your role covers.
        </p>
      </div>
    );
  }

  const orders = MOCK_ORDERS;
  const revenuePoisha = orders.reduce((total, order) => total + order.totalPoisha, 0);
  const codPendingPoisha = orders
    .filter((order) => order.paymentMethod === "COD" && order.paymentStatus === "UNPAID")
    .reduce((total, order) => total + order.totalPoisha, 0);
  const lowStock = getProducts().filter(
    (product) => product.availability === "low_stock" || product.availability === "out_of_stock",
  );

  const kpis = [
    {
      label: "Revenue (sample)",
      value: formatMoney(revenuePoisha, ADMIN_LOCALE),
      hint: "All channels",
      icon: TrendingUp,
    },
    {
      label: "Orders",
      value: String(orders.length),
      hint: "Online and in store",
      icon: Receipt,
    },
    {
      label: "COD to collect",
      value: formatMoney(codPendingPoisha, ADMIN_LOCALE),
      hint: "Unpaid COD orders",
      icon: Banknote,
    },
    {
      label: "Low or no stock",
      value: String(lowStock.length),
      hint: "Variants needing attention",
      icon: AlertTriangle,
    },
  ];

  const channelSplit = [
    {
      channel: "Online",
      orders: orders.filter((order) => order.channel === "ONLINE").length,
      revenue: orders
        .filter((order) => order.channel === "ONLINE")
        .reduce((total, order) => total + order.totalPoisha, 0),
    },
    {
      channel: "In store",
      orders: orders.filter((order) => order.channel === "STORE").length,
      revenue: orders
        .filter((order) => order.channel === "STORE")
        .reduce((total, order) => total + order.totalPoisha, 0),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sales, orders and stock across every branch and warehouse.
          </p>
        </div>
        <span className="rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          Sample figures · real reports in Phase 12
        </span>
      </header>

      {/* KPI row */}
      <section aria-label="Key figures" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
              <kpi.icon aria-hidden="true" className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Recent orders */}
        <section className="rounded-lg border border-border bg-background">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Recent orders</h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All orders
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Channel
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderNumber} className="border-t border-border">
                    <th scope="row" className="px-5 py-3 text-left font-medium tabular-nums">
                      {order.orderNumber}
                    </th>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(order.placedAt, ADMIN_LOCALE)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {order.channel === "ONLINE" ? "Online" : "In store"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          order.status === "DELIVERED"
                            ? "success"
                            : order.status === "SHIPPED"
                              ? "solid"
                              : "muted"
                        }
                      >
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatMoney(order.totalPoisha, ADMIN_LOCALE)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-8">
          {/* Channel split */}
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold">Online vs in store</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {channelSplit.map((row) => (
                <li key={row.channel}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{row.channel}</span>
                    <span className="tabular-nums">{formatMoney(row.revenue, ADMIN_LOCALE)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{
                        width: `${revenuePoisha === 0 ? 0 : Math.round((row.revenue / revenuePoisha) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.orders} {row.orders === 1 ? "order" : "orders"}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Low stock */}
          <section className="rounded-lg border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Needs restocking</h2>
              <Link
                href="/admin/inventory"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Inventory
              </Link>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {lowStock.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{product.name.en}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {product.sku}
                    </span>
                  </span>
                  <Badge
                    variant={product.availability === "out_of_stock" ? "destructive" : "muted"}
                  >
                    {product.availability === "out_of_stock" ? "Out" : "Low"}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>

          {/* Pending work sketch */}
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Package aria-hidden="true" className="size-4" />
              To do today
            </h2>
            <div aria-hidden="true" className="mt-4 flex flex-col gap-2.5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-4/5" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Packing queue, courier handover and return approvals appear here from Phase 9.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
