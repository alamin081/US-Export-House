import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { getContentForEdit } from "@/modules/content/content.service";
import { forPage } from "../../../page-guard";
import { PreviewFrames } from "./preview-frames";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export const metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * The saved draft as customers would see it, at phone, tablet and desktop
 * width. Only signed-in staff with content.write can see drafts; the frames
 * load the storefront through /api/admin/preview, which turns on draft mode.
 */
export default async function ContentPreviewPage({ params }: { params: Params }) {
  const key = decodeURIComponent((await params).key);
  const staff = await requireStaffPage("content.write");
  const document = await forPage(getContentForEdit(staff, key));
  return (
    <div className="mx-auto max-w-[96rem]">
      <Link
        href={`/admin/content/${document.key}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to the editor
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Preview: {document.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The saved draft. Unsaved changes in the editor are not shown.{" "}
        <span lang="bn">শুধু সেভ করা খসড়া দেখা যাচ্ছে।</span>
      </p>
      <PreviewFrames documentKey={document.key} />
    </div>
  );
}
