import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { listAuditLog } from "@/modules/audit/audit.service";

export const metadata = { title: "Audit log" };

/**
 * Basic audit log viewer: the latest 100 entries. Filters, paging and CSV
 * export arrive with the reports work in Phase 12.
 */
export default async function AuditLogPage() {
  const staff = await requireStaffPage("audit.view");
  const entries = await listAuditLog(staff, 100);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign-ins and every sensitive change, newest first. Entries cannot be edited or deleted.
          </p>
        </div>
        <span className="rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          Latest 100 · filters in Phase 12
        </span>
      </header>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                When
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Action
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                By
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Subject
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                IP
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No audit entries yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {formatDateTime(entry.createdAt, "en")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        entry.action.endsWith("failed") || entry.action.endsWith("throttled")
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {entry.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{entry.user?.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{entry.entityType}</span>
                    {entry.entityId === null ? null : (
                      <span className="block max-w-56 truncate">{entry.entityId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{entry.ip ?? "—"}</td>
                  <td className="px-4 py-3">
                    {entry.before === null && entry.after === null ? (
                      "—"
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">View</summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded bg-secondary p-2 text-[0.6875rem]">
                          {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                        </pre>
                      </details>
                    )}
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
