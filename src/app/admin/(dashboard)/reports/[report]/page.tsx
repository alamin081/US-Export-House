import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import {
  filtersToQuery,
  getReport,
  getReportFilterOptions,
  isReportKey,
  reportDefinition,
} from "@/modules/reports/reports.service";
import { formatDhakaDateTime } from "@/modules/reports/report-time";
import { forPage } from "../../page-guard";
import { PrintButton } from "../_components/print-button";
import { ReportFiltersForm } from "../_components/report-filters";
import { ReportBody } from "../_components/report-view";

type Params = Promise<{ report: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const { report } = await params;
  return { title: isReportKey(report) ? reportDefinition(report).title : "Report" };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ report: key }, query] = await Promise.all([params, searchParams]);
  if (!isReportKey(key)) notFound();
  const staff = await requireStaffPage("report.view");
  const [result, options] = await Promise.all([
    forPage(getReport(staff, key, query)),
    getReportFilterOptions(staff),
  ]);
  const base = filtersToQuery(result.filters);
  const canExport = hasPermission(staff, "report.export");
  const csvHref = canExport
    ? (tableId: string) =>
        `/api/admin/reports/${key}/csv?${new URLSearchParams({ ...base, table: tableId })}`
    : null;
  const range = result.filters.range;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/reports"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Reports
      </Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{result.definition.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.definition.filters.range
              ? range.fromKey === range.toKey
                ? range.fromKey
                : `${range.fromKey} to ${range.toKey}`
              : "As of now"}
            {result.filters.channel === null
              ? ""
              : ` · ${result.filters.channel === "ONLINE" ? "Online" : "In store"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {key === "sales" && canExport ? (
            <a
              href={`/api/admin/reports/sales/orders-csv?${new URLSearchParams(base)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted print:hidden"
              data-testid="csv-orders"
            >
              <Download aria-hidden="true" className="size-4" />
              Every order (CSV)
            </a>
          ) : null}
          <PrintButton />
        </div>
      </header>

      <div className="mt-6">
        <ReportFiltersForm
          definition={result.definition}
          filters={result.filters}
          locations={options.locations.map((location) => ({
            id: location.id,
            label: `${location.code} · ${location.nameEn}`,
          }))}
          categories={options.categories.map((category) => ({
            id: category.id,
            label: category.nameEn,
          }))}
          showBucket={key === "sales"}
          showDays={key === "slow-stock"}
        />
      </div>

      <p className="mt-4 hidden text-xs text-muted-foreground print:block">
        Printed {formatDhakaDateTime(new Date())} (Bangladesh time)
      </p>

      <div className="mt-6">
        <ReportBody result={result} csvHref={csvHref} />
      </div>
    </div>
  );
}
