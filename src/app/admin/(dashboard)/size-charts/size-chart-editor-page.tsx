import Link from "next/link";
import { notFound } from "next/navigation";

import { isAppError } from "@/lib/errors";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getSizeChart, getSizeCharts } from "@/modules/catalog/taxonomy.service";
import { SizeChartForm, type SizeChartInitial } from "./size-chart-form";

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : String(item ?? "")))
    : [];
}

/** Shared body of /admin/size-charts/new and /admin/size-charts/[id]. */
export async function SizeChartEditorPage({ sizeChartId }: { sizeChartId: string | null }) {
  const staff = await requireStaffPage("catalog.write");
  let initial: SizeChartInitial | null = null;
  if (sizeChartId !== null) {
    try {
      const chart = await getSizeChart(staff, sizeChartId);
      const counts = (await getSizeCharts(staff)).find(
        (candidate) => candidate.id === chart.id,
      )?._count;
      const rawColumns = Array.isArray(chart.columns)
        ? (chart.columns as Array<{ en?: unknown; bn?: unknown }>)
        : [];
      // The Phase 4 seed stored "Size" as a first column; here it is the row header.
      const dropFirst =
        typeof rawColumns[0]?.en === "string" && rawColumns[0].en.toLowerCase() === "size";
      const columns = rawColumns.slice(dropFirst ? 1 : 0).map((column) => ({
        en: typeof column.en === "string" ? column.en : "",
        bn: typeof column.bn === "string" ? column.bn : "",
      }));
      const rows = (
        Array.isArray(chart.rows) ? (chart.rows as Array<{ size?: unknown; values?: unknown }>) : []
      ).map((row) => {
        const values = strings(row.values).slice(0, columns.length);
        while (values.length < columns.length) values.push("");
        return { size: typeof row.size === "string" ? row.size : "", values };
      });
      initial = {
        id: chart.id,
        nameEn: chart.nameEn,
        nameBn: chart.nameBn,
        noteEn: chart.noteEn,
        noteBn: chart.noteBn,
        unit: chart.unit,
        columns,
        rows,
        usage: (counts?.products ?? 0) + (counts?.categories ?? 0),
      };
    } catch (error) {
      if (isAppError(error) && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/size-charts" className="text-xs text-muted-foreground hover:underline">
        ← Size charts
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {initial === null ? "New size chart" : initial.nameEn}
      </h1>
      <div className="mt-6">
        <SizeChartForm initial={initial} canDelete={hasPermission(staff, "catalog.delete")} />
      </div>
    </div>
  );
}
