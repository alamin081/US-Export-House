import "server-only";

import { hasPermission, locationScope, type StaffContext } from "@/modules/access/authorization";
import { getReportSettings } from "@/modules/settings/settings.service";
import { groupTotals, lineTotals, totalsOf, type SalesTotals } from "./report-math";
import { addDays, dhakaDateKey, dhakaMidnight, monthStart, resolveRange } from "./report-time";
import * as repo from "./reports.repository";
import { loadLineFacts, loadSalesFacts, type ReportChart } from "./reports.service";

/**
 * The admin home page (Phase 12). Every block appears only for staff whose
 * permissions cover it, and every number stays inside their locations. Sales
 * figures use exactly the same facts as the sales report, so the dashboard,
 * the report and the Z-reports agree.
 */

export interface DashboardSales {
  today: SalesTotals;
  yesterday: SalesTotals;
  month: SalesTotals;
  lastMonthSameDays: SalesTotals;
  todayByChannel: { online: SalesTotals; store: SalesTotals };
  monthByChannel: { online: SalesTotals; store: SalesTotals };
  chart: ReportChart;
  locations: Array<{ id: string; label: string; net: number }>;
  todayKey: string;
  monthFromKey: string;
}

export interface DashboardProfit {
  profitPoisha: number | null;
  marginPercent: number | null;
  unknownCostNetPoisha: number;
}

export interface DashboardTask {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "default" | "warning";
}

export interface Dashboard {
  sales: DashboardSales | null;
  profit: DashboardProfit | null;
  tasks: DashboardTask[];
  inTransit: number | null;
  openTills: Awaited<ReturnType<typeof repo.openTillDays>> | null;
  settings: { staleShipmentDays: number; codOverdueDays: number };
}

function byChannel(facts: Awaited<ReturnType<typeof loadSalesFacts>>) {
  const groups = groupTotals(facts, (fact) => fact.channel);
  const empty = totalsOf([]);
  return { online: groups.get("ONLINE") ?? empty, store: groups.get("STORE") ?? empty };
}

export async function getDashboard(staff: StaffContext, now = new Date()): Promise<Dashboard> {
  const settings = await getReportSettings();
  const ids = locationScope(staff);
  const showSales = hasPermission(staff, "report.view") && hasPermission(staff, "order.read");
  const today = dhakaDateKey(now);
  const monthFrom = monthStart(today);

  let sales: DashboardSales | null = null;
  let profit: DashboardProfit | null = null;
  if (showSales) {
    const chartFrom = addDays(today, -29);
    const lastMonthFrom = monthStart(addDays(monthFrom, -1));
    // Last month up to the same day of the month (or its end), for a fair comparison.
    const sameDay = addDays(lastMonthFrom, Number(today.slice(8, 10)) - 1);
    const lastMonthTo = sameDay < monthFrom ? sameDay : addDays(monthFrom, -1);
    const earliest = [chartFrom, lastMonthFrom].sort()[0]!;
    const facts = await loadSalesFacts({
      from: dhakaMidnight(earliest),
      to: dhakaMidnight(addDays(today, 1)),
      locationIds: ids,
      channel: null,
    });
    const between = (fromKey: string, toKey: string) =>
      facts.filter((fact) => fact.day >= fromKey && fact.day <= toKey);
    const todayFacts = between(today, today);
    const monthFacts = between(monthFrom, today);
    const chartDays = Array.from({ length: 30 }, (_, index) => addDays(chartFrom, index));
    const byDayChannel = groupTotals(
      between(chartFrom, today),
      (fact) => `${fact.day}|${fact.channel}`,
    );
    const names = new Map(
      (await repo.reportLocations(ids)).map((row) => [row.id, `${row.code} · ${row.nameEn}`]),
    );
    sales = {
      today: totalsOf(todayFacts),
      yesterday: totalsOf(between(addDays(today, -1), addDays(today, -1))),
      month: totalsOf(monthFacts),
      lastMonthSameDays: totalsOf(between(lastMonthFrom, lastMonthTo)),
      todayByChannel: byChannel(todayFacts),
      monthByChannel: byChannel(monthFacts),
      chart: {
        title: "Net sales, last 30 days",
        kind: "columns",
        valueKind: "money",
        series: [
          { key: "ONLINE", label: "Online" },
          { key: "STORE", label: "In store" },
        ],
        points: chartDays.map((day) => ({
          label: day,
          values: (["ONLINE", "STORE"] as const).map(
            (channel) => byDayChannel.get(`${day}|${channel}`)?.netSalesPoisha ?? 0,
          ),
        })),
      },
      locations: [...groupTotals(monthFacts, (fact) => fact.locationId)]
        .map(([id, totals]) => ({ id, label: names.get(id) ?? id, net: totals.netSalesPoisha }))
        .sort((a, b) => b.net - a.net),
      todayKey: today,
      monthFromKey: monthFrom,
    };
    if (hasPermission(staff, "inventory.cost.read")) {
      const range = resolveRange({
        preset: "this_month",
        now,
        weekStartsOn: settings.weekStartsOn,
      });
      const lines = await loadLineFacts({
        from: range.from,
        to: range.to,
        locationIds: ids,
        channel: null,
      });
      const totals = lineTotals(lines.facts);
      profit = {
        profitPoisha: totals.profitPoisha,
        marginPercent: totals.marginPercent,
        unknownCostNetPoisha: totals.unknownCostNetPoisha,
      };
    }
  }

  const tasks: DashboardTask[] = [];
  if (hasPermission(staff, "order.read")) {
    const day = 24 * 60 * 60 * 1000;
    const queue = await repo.workQueueCounts({
      locationIds: ids,
      staleShippedBefore: new Date(now.getTime() - settings.staleShipmentDays * day),
      codDeliveredBefore: new Date(now.getTime() - settings.codOverdueDays * day),
    });
    tasks.push(
      {
        key: "review",
        label: "To confirm — flagged for review",
        count: queue.review,
        href: "/admin/orders?tab=new&review=1",
        tone: "warning",
      },
      {
        key: "unreachable",
        label: "To confirm — customer unreachable",
        count: queue.unreachable,
        href: "/admin/orders?tab=new&unreachable=1",
        tone: "warning",
      },
      {
        key: "pending",
        label: "To confirm — other new orders",
        count: queue.pending,
        href: "/admin/orders?tab=new",
        tone: "default",
      },
      {
        key: "pack",
        label: "To pack",
        count: queue.toPack,
        href: "/admin/orders?tab=confirmed",
        tone: "default",
      },
      {
        key: "stale",
        label: `Shipped, not delivered after ${settings.staleShipmentDays} days`,
        count: queue.staleShipped,
        href: "/admin/orders?tab=shipped&stale=1",
        tone: "warning",
      },
      {
        key: "cod",
        label: `Delivered, COD not collected after ${settings.codOverdueDays} days`,
        count: queue.codOverdue,
        href: "/admin/orders?tab=delivered&codOverdue=1",
        tone: "warning",
      },
    );
  }
  if (hasPermission(staff, "refund.approve")) {
    tasks.push({
      key: "refunds",
      label: "Refunds waiting for approval",
      count: await repo.refundsAwaitingApproval(ids),
      href: "/admin/refunds",
      tone: "warning",
    });
  }
  if (hasPermission(staff, "return.manage")) {
    tasks.push({
      key: "returns",
      label: "Open returns and exchanges",
      count: await repo.openReturns(ids),
      href: "/admin/returns",
      tone: "default",
    });
  }

  const inTransit = hasPermission(staff, "inventory.read")
    ? await repo.transfersInTransit(ids)
    : null;
  const openTills =
    hasPermission(staff, "pos.day.manage") || hasPermission(staff, "pos.sell")
      ? await repo.openTillDays(ids)
      : null;

  return {
    sales,
    profit,
    tasks,
    inTransit,
    openTills,
    settings: {
      staleShipmentDays: settings.staleShipmentDays,
      codOverdueDays: settings.codOverdueDays,
    },
  };
}
