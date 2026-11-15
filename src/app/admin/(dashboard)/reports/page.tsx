import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { visibleReports } from "@/modules/reports/reports.service";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const staff = await requireStaffPage("report.view");
  const reports = visibleReports(staff);

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every figure is in Bangladesh time and limited to the locations you can see.
        </p>
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <li key={report.key}>
            <Link
              href={`/admin/reports/${report.key}`}
              className="block h-full rounded-lg border border-border bg-background p-5 hover:border-foreground/30"
              data-testid={`report-${report.key}`}
            >
              <h2 className="text-sm font-semibold">{report.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {report.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {reports.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Your role does not include any report yet.
        </p>
      ) : null}
    </div>
  );
}
