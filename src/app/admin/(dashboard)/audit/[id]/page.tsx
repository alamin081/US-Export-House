import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/modules/access/access.service";
import { getAuditEntry } from "@/modules/audit/audit-log.service";
import { forPage } from "../../page-guard";

export const metadata = { title: "Audit entry" };
export const dynamic = "force-dynamic";

/** One audit entry with a field-by-field before/after difference. */
export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("audit.view");
  const entry = await forPage(getAuditEntry(staff, id));
  const changed = entry.diff.filter((row) => row.change !== "same");

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/audit"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Audit log
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{entry.action}</h1>
      <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-border bg-background p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">When</dt>
        <dd>{formatDateTime(entry.createdAt, "en")} (Bangladesh time)</dd>
        <dt className="text-muted-foreground">By</dt>
        <dd>{entry.staff}</dd>
        <dt className="text-muted-foreground">Record</dt>
        <dd>
          {entry.entityType} {entry.entityId === null ? "" : <code>{entry.entityId}</code>}
        </dd>
        <dt className="text-muted-foreground">IP address</dt>
        <dd>{entry.ip ?? "—"}</dd>
        <dt className="text-muted-foreground">Browser</dt>
        <dd className="text-xs break-all">{entry.userAgent ?? "—"}</dd>
      </dl>

      <section
        className="mt-6 overflow-x-auto rounded-lg border border-border bg-background"
        aria-label="Changes"
      >
        <table className="w-full text-xs" data-testid="audit-diff">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Field
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Before
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                After
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.diff.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  No details recorded.
                </td>
              </tr>
            ) : (
              entry.diff.map((row) => (
                <tr
                  key={row.path}
                  className={cn(
                    "border-t border-border align-top",
                    row.change === "changed" && "bg-amber-50 dark:bg-amber-950/40",
                    row.change === "added" && "bg-emerald-50 dark:bg-emerald-950/40",
                    row.change === "removed" && "bg-red-50 dark:bg-red-950/40",
                  )}
                >
                  <th scope="row" className="px-3 py-2 text-left font-mono font-normal">
                    {row.path}
                  </th>
                  <td className="px-3 py-2 break-all">{row.before ?? "—"}</td>
                  <td className="px-3 py-2 break-all">{row.after ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        {changed.length} field{changed.length === 1 ? "" : "s"} changed. Phone numbers are masked;
        passwords and tokens were never stored.
      </p>
    </div>
  );
}
