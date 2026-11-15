import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { getContentForEdit, getLinkTargets } from "@/modules/content/content.service";
import { forPage } from "../../page-guard";
import { EditorShell } from "../_editor/editor-shell";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { key } = await params;
  return { title: `Edit ${decodeURIComponent(key)}` };
}

export default async function ContentEditorPage({ params }: { params: Params }) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const staff = await requireStaffPage("content.write");
  const [document, targets] = await Promise.all([
    forPage(getContentForEdit(staff, key)),
    getLinkTargets(staff),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/content"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Content
      </Link>
      <header className="mt-3 mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
        {document.path === null ? null : (
          <p className="mt-1 text-sm text-muted-foreground">
            On the site at <code>{document.path}</code>
          </p>
        )}
      </header>
      <EditorShell
        key={document.key}
        document={{
          ...document,
          draft: document.draft,
          publishedAt: document.publishedAt?.toISOString() ?? null,
        }}
        targets={targets}
        mockStorage={isMockStorage()}
      />
    </div>
  );
}
