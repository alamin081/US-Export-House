"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  deletePageAction,
  publishContentAction,
  restoreVersionAction,
  saveContentAction,
  unpublishPageAction,
} from "@/modules/content/content.actions";
import type { ContentIssue } from "@/modules/content/content-checks";
import type {
  AnnouncementsContent,
  FooterContent,
  HomeContent,
  MenuContent,
  PageContent,
} from "@/modules/content/content.schema";
import { useUnsavedChangesWarning } from "../../catalogue/use-unsaved-changes";
import { EditorContext, type LinkTargets } from "./fields";
import { HomeEditor } from "./home-editor";
import { AnnouncementsEditor, FooterEditor, MenuEditor, PageEditor } from "./simple-editors";

export interface EditorDocument {
  key: string;
  kind: "HOME" | "ANNOUNCEMENTS" | "MENU" | "FOOTER" | "PAGE";
  slug: string | null;
  title: string;
  path: string | null;
  draft: unknown;
  revision: number;
  isSample: boolean;
  isSystem: boolean;
  publishedNumber: number | null;
  publishedAt: string | null;
  changed: boolean;
  issues: ContentIssue[];
  versions: Array<{
    id: string;
    number: number;
    note: string | null;
    publishedAt: string;
    by: string;
  }>;
  canPublish: boolean;
  publishPermission: string | null;
  production: boolean;
}

type Message = { tone: "success" | "error"; text: string } | null;

const dhaka = (iso: string) =>
  new Date(Date.parse(iso) + 6 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

/**
 * Every content editor sits in this shell: save (draft), preview, publish
 * with a note, the checks that block publishing, and the version history.
 */
export function EditorShell({
  document,
  targets,
  mockStorage,
}: {
  document: EditorDocument;
  targets: LinkTargets;
  mockStorage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<unknown>(document.draft);
  const [revision, setRevision] = useState(document.revision);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();
  useUnsavedChangesWarning(dirty);

  const change = (next: unknown) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  };
  const errors = document.issues.filter((issue) => issue.level === "error");
  const warnings = document.issues.filter((issue) => issue.level === "warning");
  const context = useMemo(() => ({ targets, mockStorage }), [targets, mockStorage]);
  const blockedBySample = document.production && document.isSample;

  const save = () =>
    start(async () => {
      const result = await saveContentAction({ key: document.key, revision, draft });
      if (result.status === "success") {
        setRevision(result.revision ?? revision + 1);
        setDirty(false);
        setMessage({ tone: "success", text: result.message });
        router.refresh();
      } else if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
      }
    });

  const publish = () =>
    start(async () => {
      const result = await publishContentAction({ key: document.key, revision, note });
      if (result.status === "success") {
        setNote("");
        setMessage({ tone: "success", text: result.message });
        router.refresh();
      } else if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
      }
    });

  const run = (work: () => Promise<{ status: string; message?: string }>) =>
    start(async () => {
      const result = await work();
      if (result.status === "success") {
        setMessage({ tone: "success", text: result.message ?? "Done." });
        router.refresh();
      } else if (result.status === "error") {
        setMessage({ tone: "error", text: result.message ?? "Something went wrong." });
      }
    });

  const editor = (() => {
    switch (document.kind) {
      case "HOME":
        return <HomeEditor value={draft as HomeContent} onChange={change} />;
      case "ANNOUNCEMENTS":
        return <AnnouncementsEditor value={draft as AnnouncementsContent} onChange={change} />;
      case "MENU":
        return <MenuEditor value={draft as MenuContent} onChange={change} />;
      case "FOOTER":
        return <FooterEditor value={draft as FooterContent} onChange={change} />;
      case "PAGE":
        return (
          <PageEditor value={draft as PageContent} onChange={change} slug={document.path ?? ""} />
        );
    }
  })();

  return (
    <EditorContext.Provider value={context}>
      <div className="flex flex-col gap-4">
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-3 backdrop-blur">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              document.publishedNumber === null
                ? "bg-secondary text-secondary-foreground"
                : document.changed || dirty
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
            )}
            data-testid="content-status"
          >
            {document.publishedNumber === null
              ? "Never published"
              : document.changed || dirty
                ? `Live: version ${document.publishedNumber} · draft has changes`
                : `Live: version ${document.publishedNumber}`}
          </span>
          {dirty ? <span className="text-xs text-amber-700">Unsaved changes</span> : null}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              data-testid="save-draft"
            >
              {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              Save draft
            </Button>
            <a
              href={`/admin/content/${document.key}/preview`}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary",
                dirty && "pointer-events-none opacity-50",
              )}
              aria-disabled={dirty}
              data-testid="preview-link"
            >
              <Eye aria-hidden="true" className="size-4" />
              Preview
            </a>
            <Button type="button" variant="ghost" onClick={() => setShowHistory((open) => !open)}>
              <History aria-hidden="true" className="size-4" />
              History ({document.versions.length})
            </Button>
          </div>
        </div>

        {document.isSample ? (
          <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              This is sample text. Replace it with your own and save. Sample content cannot be
              published on the live site.{" "}
              <span lang="bn">এটি নমুনা লেখা — নিজের লেখা দিয়ে বদলে সেভ করুন।</span>
            </span>
          </p>
        ) : null}

        {message === null ? null : (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              message.tone === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
            )}
            data-testid="editor-message"
          >
            {message.text}
          </p>
        )}

        {showHistory ? (
          <section
            className="rounded-lg border border-border bg-background p-4"
            aria-label="Version history"
          >
            <h2 className="text-sm font-semibold">Published versions</h2>
            {document.versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Not published yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {document.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">Version {version.number}</span> ·{" "}
                      {dhaka(version.publishedAt)} · {version.by}
                      {version.note === null ? "" : ` — ${version.note}`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Replace the current draft with version ${version.number}? Your unpublished changes will be lost.`,
                          )
                        ) {
                          start(async () => {
                            const result = await restoreVersionAction({
                              key: document.key,
                              versionId: version.id,
                              revision,
                            });
                            if (result.status === "success") {
                              setDirty(false);
                              // Load the restored draft into the editor.
                              window.location.reload();
                            } else if (result.status === "error") {
                              setMessage({ tone: "error", text: result.message });
                            }
                          });
                        }
                      }}
                    >
                      Copy into draft
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {editor}

        <section
          className="rounded-lg border border-border bg-background p-4"
          aria-labelledby="publish-title"
        >
          <h2 id="publish-title" className="text-sm font-semibold">
            Publish
          </h2>
          {errors.length === 0 && warnings.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No problems found in the saved draft.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="content-issues">
              {errors.map((issue) => (
                <li key={issue.message} className="text-destructive">
                  ✕ {issue.message}
                </li>
              ))}
              {warnings.map((issue) => (
                <li key={issue.message} className="text-amber-700 dark:text-amber-400">
                  ! {issue.message}
                </li>
              ))}
            </ul>
          )}
          {dirty ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Save the draft to check it again before publishing.
            </p>
          ) : null}
          {document.canPublish ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1">
                <label htmlFor="publish-note" className="mb-1 block text-xs text-muted-foreground">
                  Note for the history (optional)
                </label>
                <Input
                  id="publish-note"
                  value={note}
                  maxLength={200}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={publish}
                disabled={pending || dirty || errors.length > 0 || blockedBySample}
                data-testid="publish"
              >
                Publish
              </Button>
              {document.kind === "PAGE" && document.publishedNumber !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm("Take this page off the site? Its text and history are kept.")
                    ) {
                      run(() => unpublishPageAction(document.key));
                    }
                  }}
                >
                  Take off the site
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="publish-not-allowed">
              You can edit and save, but publishing needs the{" "}
              <code>{document.publishPermission ?? "content.publish"}</code> permission — ask a
              manager. <span lang="bn">Publish করার অনুমতি নেই — ম্যানেজারকে বলুন।</span>
            </p>
          )}
          {document.publishPermission === "return.policy.publish" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              This is the return policy: publishing it is the approval, and checkout links to it
              only while it is published. Every change needs approval again.
            </p>
          ) : null}
          {blockedBySample ? (
            <p className="mt-2 text-xs text-destructive">
              Sample content cannot be published on the live site.
            </p>
          ) : null}
          {document.kind === "PAGE" &&
          !document.isSystem &&
          document.publishedNumber === null &&
          document.versions.length === 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this page? It has never been published.")) {
                    run(() => deletePageAction(document.key));
                  }
                }}
              >
                Delete page
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </EditorContext.Provider>
  );
}
