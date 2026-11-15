import Link from "next/link";

import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/modules/access/access.service";
import { listContent } from "@/modules/content/content.service";
import { forPage } from "../page-guard";
import { NewPageForm } from "./new-page-form";

export const metadata = { title: "Content" };
export const dynamic = "force-dynamic";

const dhaka = (date: Date) =>
  new Date(date.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

function Status({
  published,
  changed,
  isSample,
}: {
  published: boolean;
  changed: boolean;
  isSample: boolean;
}) {
  const [text, tone] = isSample
    ? ["Sample text", "bg-amber-100 text-amber-900"]
    : !published
      ? ["Not published", "bg-secondary text-secondary-foreground"]
      : changed
        ? ["Live · unpublished changes", "bg-amber-100 text-amber-900"]
        : ["Live", "bg-emerald-100 text-emerald-900"];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{text}</span>;
}

/**
 * Everything on the storefront that is not a product: the home page, the
 * announcement bar, the menu, the footer and every page (Phase 12).
 */
export default async function ContentPage() {
  const staff = await requireStaffPage("content.write");
  const rows = await forPage(listContent(staff));
  const singles = rows.filter((row) => row.kind !== "PAGE");
  const pages = rows.filter((row) => row.kind === "PAGE");

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit, preview, then publish. Nothing changes on the site until you publish.{" "}
          <span lang="bn">সেভ করলে শুধু খসড়া থাকে; Publish করলে সাইটে দেখা যায়।</span>
        </p>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {singles.map((row) => (
          <li key={row.key}>
            <Link
              href={`/admin/content/${row.key}`}
              className="flex h-full flex-col gap-2 rounded-lg border border-border bg-background p-4 hover:border-foreground/30"
              data-testid={`content-${row.key}`}
            >
              <span className="text-sm font-semibold">{row.title}</span>
              <Status published={row.published} changed={row.changed} isSample={row.isSample} />
              <span className="text-xs text-muted-foreground">
                Edited {dhaka(row.draftUpdatedAt)}
                {row.missingBengali > 0 ? ` · ${row.missingBengali} without Bengali` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section
        className="mt-10 rounded-lg border border-border bg-background"
        aria-labelledby="pages-title"
      >
        <header className="border-b border-border px-4 py-3">
          <h2 id="pages-title" className="text-sm font-semibold">
            Pages
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  Page
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Address
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Last edited
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/content/${row.key}`}
                      className="font-medium hover:underline hover:underline-offset-4"
                      data-testid={`content-${row.key}`}
                    >
                      {row.title}
                    </Link>
                    {row.missingBengali > 0 ? (
                      <span className="ms-2 text-xs text-amber-700">
                        {row.missingBengali} without Bengali
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    <code>{row.path}</code>
                  </td>
                  <td className="px-4 py-2">
                    <Status
                      published={row.published}
                      changed={row.changed}
                      isSample={row.isSample}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {dhaka(row.draftUpdatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="mt-8 rounded-lg border border-border bg-background p-4"
        aria-labelledby="new-page-title"
      >
        <h2 id="new-page-title" className="text-sm font-semibold">
          New page
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          New pages live at /pages/&lt;address&gt;, e.g. /pages/eid-offer. নতুন পেজের ঠিকানা
          ইংরেজিতে লিখুন।
        </p>
        <NewPageForm />
      </section>
    </div>
  );
}
