import Link from "next/link";
import { Download, HelpCircle, Images } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { listProductImports } from "@/modules/catalog/import/product-import.service";
import { ImportUploadForm } from "./import-upload-form";

export const metadata = { title: "Import products" };

/** A file download (Route Handler), not a page: a plain link. */
const TEMPLATE_URL = `/api/admin/products/import/template`;

const STATUS: Record<
  string,
  { label: string; variant: "muted" | "success" | "destructive" | "outline" }
> = {
  VALIDATED: { label: "Checked", variant: "outline" },
  APPLYING: { label: "Saving", variant: "muted" },
  DONE: { label: "Done", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Stopped", variant: "muted" },
};

function when(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

export default async function ProductImportPage() {
  const staff = await requireStaffPage("catalog.import");
  const imports = await listProductImports(staff);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/products" className="hover:underline">
              Products
            </Link>{" "}
            / Import
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Import products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and update products from a spreadsheet. Nothing is ever deleted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={TEMPLATE_URL}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            data-testid="import-template"
          >
            <Download aria-hidden="true" />
            Template
          </a>
          <Link
            href="/admin/products/import/help"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <HelpCircle aria-hidden="true" />
            Columns and codes
          </Link>
          {hasPermission(staff, "catalog.write") ? (
            <Link
              href="/admin/products/images"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Images aria-hidden="true" />
              Bulk images
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-background p-5">
        <ImportUploadForm />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Saving a CSV from Excel or Google Sheets
          </summary>
          <ul className="mt-2 list-disc ps-5 text-muted-foreground" lang="bn">
            <li>
              Excel-এর .xlsx সরাসরি আপলোড করা যায় (শুধু প্রথম sheet)। CSV চাইলে: File → Save As →
              ধরন: <em>CSV UTF-8 (Comma delimited)</em> → Save।
            </li>
            <li>Google Sheets: File → Download → Comma-separated values (.csv)।</li>
            <li>
              এক সারি = এক ভ্যারিয়েন্ট (সাইজ/রঙ)। প্রোডাক্টের ঘর (নাম, ক্যাটাগরি …) প্রথম সারিতে
              লিখলেই হবে।
            </li>
            <li>ঐচ্ছিক লেখা মুছতে ঘরে [clear] লিখুন; ফাঁকা ঘর মানে “বদলাবে না”।</li>
          </ul>
        </details>
      </section>

      <section>
        <h2 className="text-base font-semibold">History</h2>
        {imports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-testid="import-history">
              <thead className="bg-secondary/60 text-start text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">When</th>
                  <th className="px-3 py-2 text-start font-medium">By</th>
                  <th className="px-3 py-2 text-start font-medium">File</th>
                  <th className="px-3 py-2 text-start font-medium">Status</th>
                  <th className="px-3 py-2 text-end font-medium">Rows</th>
                  <th className="px-3 py-2 text-end font-medium">New</th>
                  <th className="px-3 py-2 text-end font-medium">Updates</th>
                  <th className="px-3 py-2 text-end font-medium">Errors</th>
                  <th className="px-3 py-2 text-end font-medium">Saved / skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imports.map((row) => {
                  const status = STATUS[row.status] ?? STATUS.VALIDATED!;
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{when(row.createdAt)}</td>
                      <td className="px-3 py-2">{row.createdBy}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/products/import/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.fileName}
                        </Link>
                        {row.mode === "GOOD_ONLY" ? (
                          <span className="ms-2 text-xs text-muted-foreground">good only</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">{row.rowCount}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{row.createCount}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{row.updateCount}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{row.errorCount}</td>
                      <td className="px-3 py-2 text-end tabular-nums">
                        {row.appliedCount} / {row.skippedCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
