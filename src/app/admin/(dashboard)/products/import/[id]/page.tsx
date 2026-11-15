import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAppError } from "@/lib/errors";
import { requireStaffPage } from "@/modules/access/access.service";
import {
  getImportPreview,
  type ImportPreview,
} from "@/modules/catalog/import/product-import.service";
import { ApplyPanel } from "./apply-panel";

export const metadata = { title: "Import preview" };

type Row = ImportPreview["rows"][number];

function Card({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "bad" && value > 0
            ? "text-destructive"
            : tone === "warn" && value > 0
              ? "text-amber-700 dark:text-amber-300"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Issues({ items }: { items: Row["errors"] }) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-sm" lang="bn">
      {items.map((issue, index) => (
        <li key={index}>
          {issue.row === null ? "" : `সারি ${issue.row}: `}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function ProductLine({ row }: { row: Row }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-medium">{row.productName}</span>
      {row.productCode !== null && !row.productCode.startsWith("#") ? (
        <span className="font-mono text-xs text-muted-foreground">{row.productCode}</span>
      ) : null}
      <span className="text-xs text-muted-foreground">
        rows {row.rowNumbers.slice(0, 6).join(", ")}
        {row.rowNumbers.length > 6 ? "…" : ""}
      </span>
      {row.outcome === "APPLIED" ? <Badge variant="success">Saved</Badge> : null}
      {row.outcome === "SKIPPED" ? <Badge variant="destructive">Skipped</Badge> : null}
    </div>
  );
}

function RowList({ rows, render }: { rows: Row[]; render: (row: Row) => React.ReactNode }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">None.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="py-3">
          <ProductLine row={row} />
          {render(row)}
          {row.outcomeReason === null ? null : (
            <p className="mt-1 text-sm text-destructive" lang="bn">
              {row.outcomeReason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("catalog.import");
  const { id } = await params;
  let preview: ImportPreview;
  try {
    preview = await getImportPreview(staff, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const by = (action: Row["action"]) => preview.rows.filter((row) => row.action === action);
  const warned = preview.rows.filter((row) => row.warnings.length > 0);
  const planned = preview.counts.create + preview.counts.update;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/products/import" className="hover:underline">
              Import
            </Link>{" "}
            / {preview.fileName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Import preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.fileKind.toUpperCase()} · checked by {preview.createdBy} ·{" "}
            {new Date(preview.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} ·{" "}
            <span data-testid="import-status">{preview.status}</span>
          </p>
        </div>
        {preview.counts.error > 0 || preview.counts.skipped > 0 ? (
          <a
            href={`/api/admin/products/import/${preview.id}/errors`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            data-testid="import-errors-csv"
          >
            <Download aria-hidden="true" />
            Error list (CSV)
          </a>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="import-summary">
        <Card label="New products" value={preview.counts.create} />
        <Card label="Updates" value={preview.counts.update} />
        <Card label="Unchanged" value={preview.counts.unchanged} />
        <Card label="Errors" value={preview.counts.error} tone="bad" />
        <Card label="Warnings" value={preview.counts.warning} tone="warn" />
      </div>

      {preview.expired && preview.status === "VALIDATED" ? (
        <p role="alert" className="text-sm text-destructive" lang="bn">
          এই যাচাই ২৪ ঘণ্টার বেশি পুরনো। ফাইলটা আবার আপলোড করুন।
        </p>
      ) : null}
      {preview.failureReason === null ? null : (
        <p role="alert" className="text-sm text-destructive" lang="bn">
          {preview.failureReason} কিছুই সেভ হয়নি।
        </p>
      )}
      {preview.status === "DONE" ? (
        <p role="status" className="text-sm text-success">
          Done: {preview.counts.applied} saved
          {preview.counts.skipped > 0 ? `, ${preview.counts.skipped} skipped` : ""}.
        </p>
      ) : null}
      {preview.fileWarnings.length === 0 ? null : (
        <div className="rounded-md bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <Issues items={preview.fileWarnings} />
        </div>
      )}

      <ApplyPanel
        importId={preview.id}
        status={preview.status}
        mode={preview.mode}
        canApply={preview.canApply}
        errorCount={preview.counts.error}
        plannedCount={planned}
        allowPartial={preview.allowPartial}
        atomicTooBig={preview.atomicTooBig}
        atomicMaxRows={preview.atomicMaxRows}
        duplicate={preview.duplicate}
      />

      <Tabs defaultValue={preview.counts.error > 0 ? "errors" : "create"}>
        <TabsList>
          <TabsTrigger value="create">New ({preview.counts.create})</TabsTrigger>
          <TabsTrigger value="update">Updates ({preview.counts.update})</TabsTrigger>
          <TabsTrigger value="errors">Errors ({preview.counts.error})</TabsTrigger>
          <TabsTrigger value="warnings">Warnings ({warned.length})</TabsTrigger>
          <TabsTrigger value="unchanged">Unchanged ({preview.counts.unchanged})</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <RowList
            rows={by("CREATE")}
            render={(row) => (
              <p className="text-sm text-muted-foreground">
                {row.newVariants} variant{row.newVariants === 1 ? "" : "s"}
                {row.requestedPublish ? " · publish requested (after images)" : ""}
              </p>
            )}
          />
        </TabsContent>
        <TabsContent value="update">
          <RowList
            rows={by("UPDATE")}
            render={(row) => (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border/60">
                    {row.diff.map((entry, index) => (
                      <tr key={index}>
                        <td className="py-1 pe-3 font-mono text-xs text-muted-foreground">
                          {entry.sku === null ? entry.field : `${entry.sku} · ${entry.field}`}
                        </td>
                        <td className="py-1 pe-3 text-muted-foreground line-through">
                          {entry.before || "—"}
                        </td>
                        <td
                          className={`py-1 ${entry.field.endsWith("_tk") ? "font-medium text-[var(--viz-2)]" : ""}`}
                        >
                          {entry.after || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {row.newVariants > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    + {row.newVariants} new variant{row.newVariants === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            )}
          />
        </TabsContent>
        <TabsContent value="errors">
          <RowList
            rows={by("ERROR")}
            render={(row) => (
              <div className="text-destructive">
                <Issues items={row.errors} />
              </div>
            )}
          />
        </TabsContent>
        <TabsContent value="warnings">
          <RowList
            rows={warned}
            render={(row) => (
              <div className="text-amber-800 dark:text-amber-200">
                <Issues items={row.warnings} />
              </div>
            )}
          />
        </TabsContent>
        <TabsContent value="unchanged">
          <RowList rows={by("UNCHANGED")} render={() => null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
