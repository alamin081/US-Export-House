import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { listLabels } from "@/modules/content/ui-labels.service";
import { forPage } from "../../page-guard";
import { LabelsEditor } from "./labels-editor";

export const metadata = { title: "Storefront labels" };
export const dynamic = "force-dynamic";

/**
 * Rewording the storefront's fixed labels (buttons, headings, short
 * messages). Checkout, payment, order and policy wording is locked.
 */
export default async function LabelsPage() {
  const staff = await requireStaffPage("content.write");
  const data = await forPage(listLabels(staff));
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/content"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Content
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Storefront labels</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Change the wording of buttons and headings. Saving goes live at once. Clear a box to bring
        back the original. Checkout, payment, order and policy messages cannot be changed here.{" "}
        <span lang="bn">বাটন ও শিরোনামের লেখা বদলান; খালি করলে আগের লেখা ফিরে আসবে।</span>
      </p>
      {data.canSave ? null : (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Saving needs the content.publish permission. You can read the labels.
        </p>
      )}
      <LabelsEditor labels={data.labels} canSave={data.canSave} />
    </div>
  );
}
