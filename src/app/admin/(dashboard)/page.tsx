import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getLowStock } from "@/modules/inventory/inventory.service";
import { getDashboard } from "@/modules/reports/dashboard.service";
import type { SalesTotals } from "@/modules/reports/report-math";
import { ageInDays, dhakaDateKey } from "@/modules/reports/report-time";
import { ordersDrillDown } from "@/modules/reports/reports.service";
import { LowStockWidget } from "./low-stock-widget";
import { count, money, percent } from "./reports/_components/format";
import { ReportChartView } from "./reports/_components/report-chart";

/**
 * Admin dashboard (Phase 12): real figures, inside the staff member's
 * locations. Sales use the same definitions as the sales report — an online
 * order counts when it is first shipped, a till sale when it is rung up,
 * and refunds, exchange credit and delivery returns come off the net.
 */
export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function change(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}%`;
}

function SalesTile({
  label,
  totals,
  previous,
  previousLabel,
  href,
}: {
  label: string;
  totals: SalesTotals;
  previous: SalesTotals;
  previousLabel: string;
  href: string;
}) {
  const delta = change(totals.netSalesPoisha, previous.netSalesPoisha);
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-background p-5 hover:border-foreground/30"
      data-testid={`sales-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-xs text-muted-foreground">{label} · net sales</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums" data-testid="net-sales">
        {money(totals.netSalesPoisha)}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Orders</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{count(totals.orders)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Average</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{money(totals.averageOrderPoisha)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">vs {previousLabel}</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{delta ?? "—"}</dd>
        </div>
      </dl>
    </Link>
  );
}

function ChannelSplit({
  title,
  online,
  store,
}: {
  title: string;
  online: SalesTotals;
  store: SalesTotals;
}) {
  const rows = [
    { label: "Online", totals: online, color: "var(--viz-1)" },
    { label: "In store", totals: store, color: "var(--viz-2)" },
  ];
  const total = Math.max(1, online.netSalesPoisha + store.netSalesPoisha);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ background: row.color }}
            />
            <span className="w-20">{row.label}</span>
            <span className="flex-1 tabular-nums">{money(row.totals.netSalesPoisha)}</span>
            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
              {count(row.totals.orders)} orders
            </span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
              {percent((Math.max(0, row.totals.netSalesPoisha) / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const staff = await requireStaffPage();
  const [dashboard, lowStock] = await Promise.all([
    getDashboard(staff),
    hasPermission(staff, "inventory.read") ? getLowStock(staff, 6) : Promise.resolve(null),
  ]);
  const { sales, profit, tasks, inTransit, openTills } = dashboard;
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {sales === null
              ? `Welcome${staff.name === null ? "" : `, ${staff.name}`}`
              : "Dashboard"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{staff.roleName}</span>.{" "}
            {staff.allLocations ? "Every location." : "Your locations only."} Bangladesh time.
          </p>
        </div>
        {sales === null ? null : (
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All reports
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </header>

      {sales === null ? null : (
        <>
          <section aria-label="Sales" className="mt-8 grid gap-4 lg:grid-cols-2">
            <SalesTile
              label="Today"
              totals={sales.today}
              previous={sales.yesterday}
              previousLabel="yesterday"
              href={`/admin/reports/sales?range=today`}
            />
            <SalesTile
              label="This month"
              totals={sales.month}
              previous={sales.lastMonthSameDays}
              previousLabel="last month"
              href={`/admin/reports/sales?range=this_month`}
            />
          </section>

          <section className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-5 sm:grid-cols-2">
            <ChannelSplit
              title="Today by channel"
              online={sales.todayByChannel.online}
              store={sales.todayByChannel.store}
            />
            <ChannelSplit
              title="This month by channel"
              online={sales.monthByChannel.online}
              store={sales.monthByChannel.store}
            />
          </section>

          {profit === null ? null : (
            <section
              className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-5 sm:grid-cols-3"
              aria-label="Profit"
              data-testid="profit-widget"
            >
              <div>
                <p className="text-xs text-muted-foreground">This month · profit</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {money(profit.profitPoisha)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margin</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {percent(profit.marginPercent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sales with unknown cost</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {money(profit.unknownCostNetPoisha)}
                </p>
                <Link
                  href="/admin/reports/profit"
                  className="mt-1 inline-block text-xs underline underline-offset-4"
                >
                  Profit report
                </Link>
              </div>
            </section>
          )}

          <div className="mt-4">
            <ReportChartView chart={sales.chart} />
          </div>

          {sales.locations.length > 1 ? (
            <section className="mt-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-sm font-semibold">This month by location</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {sales.locations.map((location) => {
                  const max = Math.max(1, ...sales.locations.map((entry) => entry.net));
                  return (
                    <li
                      key={location.id}
                      className="grid grid-cols-[12rem_1fr_7rem] items-center gap-3 text-sm"
                    >
                      <span className="truncate">{location.label}</span>
                      <span
                        className="h-3 rounded-e-[4px] bg-[var(--viz-1)]"
                        style={{ width: `${(Math.max(0, location.net) / max) * 100}%` }}
                      />
                      <span className="text-right tabular-nums">{money(location.net)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {tasks.length === 0 ? null : (
          <section
            className="rounded-lg border border-border bg-background p-5"
            data-testid="work-queue"
          >
            <h2 className="text-sm font-semibold">To do</h2>
            <ul className="mt-3 flex flex-col">
              {tasks.map((task) => (
                <li key={task.key} className="border-t border-border first:border-0">
                  <Link
                    href={task.href}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline hover:underline-offset-4"
                    data-testid={`task-${task.key}`}
                  >
                    <span>{task.label}</span>
                    <span
                      className={cn(
                        "min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-medium tabular-nums",
                        task.count > 0 && task.tone === "warning"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {count(task.count)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lowStock === null ? null : <LowStockWidget data={lowStock} />}

        {inTransit === null && openTills === null ? null : (
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold">Stock and tills</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {inTransit === null ? null : (
                <li className="flex justify-between">
                  <Link
                    href="/admin/transfers"
                    className="hover:underline hover:underline-offset-4"
                  >
                    Transfers on the way
                  </Link>
                  <span className="tabular-nums">{count(inTransit)}</span>
                </li>
              )}
              {openTills === null ? null : openTills.length === 0 ? (
                <li className="text-muted-foreground">No till day is open.</li>
              ) : (
                openTills.map((till) => {
                  const hours = Math.floor((now.getTime() - till.openedAt.getTime()) / 3_600_000);
                  return (
                    <li key={till.id} className="flex justify-between gap-3">
                      <Link
                        href={`/admin/pos/day/${till.id}`}
                        className="hover:underline hover:underline-offset-4"
                      >
                        Till open · {till.location.code} ({till.counterCode})
                      </Link>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          hours >= 18 ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
                        )}
                      >
                        {ageInDays(till.openedAt, now) > 0
                          ? `since ${dhakaDateKey(till.openedAt)} · `
                          : ""}
                        {hours} h
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        )}
      </div>

      {sales === null ? null : (
        <p className="mt-6 text-xs text-muted-foreground">
          Online orders count when first shipped; till sales when rung up. Refunds, exchange credit
          and failed deliveries come off net sales.{" "}
          <Link
            href={ordersDrillDown(sales.monthFromKey, sales.todayKey)}
            className="underline underline-offset-4"
          >
            This month&rsquo;s online orders
          </Link>
        </p>
      )}
    </div>
  );
}
