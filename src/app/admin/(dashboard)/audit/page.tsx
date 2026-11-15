import { Download } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { listAudit } from "@/modules/audit/audit-log.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const field =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Sign-ins and every sensitive change, newest first (Phase 12): filters,
 * paging and a detail page with the difference. Entries cannot be edited or
 * deleted — the database refuses it. Phone numbers are masked.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("audit.view");
  const result = await forPage(listAudit(staff, await searchParams));
  const query = new URLSearchParams(result.query);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.total.toLocaleString("en")} entries match. Entries cannot be edited or deleted.{" "}
            <span lang="bn">অডিট লগ কেউ বদলাতে বা মুছতে পারে না।</span>
          </p>
        </div>
        {hasPermission(staff, "audit.export") ? (
          <a
            href={`/api/admin/audit/csv?${query.toString()}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary"
            data-testid="audit-csv"
          >
            <Download aria-hidden="true" className="size-4" />
            CSV
          </a>
        ) : null}
      </header>

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3"
        aria-label="Filters"
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={result.query.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={result.query.to ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Staff
          <select name="staff" defaultValue={result.query.staff ?? ""} className={field}>
            <option value="">Everyone</option>
            {result.choices.staff.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Action
          <select
            name="action"
            defaultValue={result.query.action ?? ""}
            className={field}
            data-testid="audit-action"
          >
            <option value="">All</option>
            {[...new Set(result.choices.actions.map((action) => `${action.split(".")[0]}.`))].map(
              (prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}* (all)
                </option>
              ),
            )}
            {result.choices.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Record type
          <select name="entity" defaultValue={result.query.entity ?? ""} className={field}>
            <option value="">All</option>
            {result.choices.entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Record id
          <input name="id" defaultValue={result.query.id ?? ""} className={`${field} w-48`} />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Apply
        </button>
        <Link href="/admin/audit" className="text-sm underline underline-offset-4">
          Clear
        </Link>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full text-xs" data-testid="audit-table">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                When (Bangladesh)
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Action
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                By
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Record
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                IP
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No entries match.
                </td>
              </tr>
            ) : (
              result.rows.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    <Link
                      href={`/admin/audit/${entry.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {formatDateTime(entry.createdAt, "en")}
                    </Link>
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
                  <td className="px-4 py-3">{entry.staff}</td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{entry.entityType}</span>
                    {entry.entityId === null ? null : (
                      <span className="block max-w-56 truncate">{entry.entityId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{entry.ip ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-between text-sm">
        <Link href={`/admin/audit?${query.toString()}`} className="underline underline-offset-4">
          ← Newest
        </Link>
        {result.nextCursor === null ? null : (
          <Link
            href={`/admin/audit?${new URLSearchParams({ ...result.query, cursor: result.nextCursor }).toString()}`}
            className="underline underline-offset-4"
            data-testid="audit-older"
          >
            Older entries →
          </Link>
        )}
      </div>
    </div>
  );
}
