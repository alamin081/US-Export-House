import { Download } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ReportKpi, ReportResult, ReportTable } from "@/modules/reports/reports.service";
import { cellText, count, money, percent } from "./format";
import { ReportChartView } from "./report-chart";

function kpiValue(kpi: ReportKpi): string {
  if (kpi.kind === "money") return money(kpi.value);
  if (kpi.kind === "percent") return percent(kpi.value);
  return count(kpi.value);
}

export function KpiTiles({ kpis }: { kpis: readonly ReportKpi[] }) {
  return (
    <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi) => {
        const body = (
          <>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                kpi.tone === "negative" && "text-red-700 dark:text-red-400",
                kpi.tone === "warning" && "text-amber-700 dark:text-amber-400",
              )}
            >
              {kpiValue(kpi)}
            </p>
            {kpi.hint === undefined ? null : (
              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            )}
          </>
        );
        return kpi.href === undefined ? (
          <div key={kpi.label} className="rounded-lg border border-border bg-background p-4">
            {body}
          </div>
        ) : (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="rounded-lg border border-border bg-background p-4 hover:border-foreground/30"
          >
            {body}
          </Link>
        );
      })}
    </section>
  );
}

export function ReportTableView({
  table,
  csvHref,
}: {
  table: ReportTable;
  csvHref: string | null;
}) {
  const numeric = (kind: string) => kind !== "text";
  return (
    <section
      className="rounded-lg border border-border bg-background print:break-inside-avoid"
      aria-labelledby={`table-${table.id}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id={`table-${table.id}`} className="text-sm font-semibold">
          {table.title}
        </h2>
        {csvHref === null || table.rows.length === 0 ? null : (
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
            data-testid={`csv-${table.id}`}
          >
            <Download aria-hidden="true" className="size-3.5" />
            CSV
          </a>
        )}
      </header>
      {table.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {table.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "px-3 py-2 font-medium whitespace-nowrap",
                      numeric(column.kind) && "text-right",
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index} className="border-b border-border/60 last:border-0">
                  {table.columns.map((column, columnIndex) => {
                    const value = cellText(row.cells[column.key], column.kind);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "px-3 py-2 whitespace-nowrap",
                          numeric(column.kind) && "text-right tabular-nums",
                        )}
                      >
                        {columnIndex === 0 && row.href !== undefined ? (
                          <Link href={row.href} className="underline-offset-4 hover:underline">
                            {value}
                          </Link>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {table.totals === undefined ? null : (
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  {table.columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 whitespace-nowrap",
                        numeric(column.kind) && "text-right tabular-nums",
                      )}
                    >
                      {table.totals?.[column.key] === undefined
                        ? ""
                        : cellText(table.totals[column.key], column.kind)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {table.note === undefined ? null : (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {table.note}
        </p>
      )}
    </section>
  );
}

export function ReportBody({
  result,
  csvHref,
}: {
  result: ReportResult;
  /** Builds the CSV link for a table, or null without report.export. */
  csvHref: ((tableId: string) => string) | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <KpiTiles kpis={result.kpis} />
      {result.chart === null ? null : <ReportChartView chart={result.chart} />}
      {result.tables.map((table) => (
        <ReportTableView
          key={table.id}
          table={table}
          csvHref={csvHref === null ? null : csvHref(table.id)}
        />
      ))}
      {result.notes.length === 0 ? null : (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
