"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderOpen, ImagePlus, Loader2, RotateCcw, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { changeProductStatusAction } from "@/modules/catalog/catalog.actions";
import {
  conflictingSlots,
  IMAGE_ACCEPT,
  matchImageName,
  slotKey,
  type ImageMatch,
  type ImageMatchProduct,
} from "@/modules/catalog/import/image-names";
import { attachBulkImagesAction } from "@/modules/catalog/import/product-import.actions";
import type { UploadedImage } from "@/modules/media/media.service";
import { uploadImage } from "../../catalogue/upload-image";

type FileStatus = "waiting" | "uploading" | "uploaded" | "saved" | "failed";

interface Item {
  id: string;
  file: File;
  url: string;
  match: ImageMatch;
  conflict: boolean;
  status: FileStatus;
  error: string | null;
  upload: UploadedImage | null;
}

interface Props {
  products: ImageMatchProduct[];
  concurrency: number;
  canPublish: boolean;
  publishRequested: string[];
}

/**
 * Bulk images: choose a folder or files, see where each one goes (by its
 * name), then upload a few at a time. A product's images are saved together
 * once all of its files are up; failed files can be retried without sending
 * the finished ones again.
 */
export function BulkImages({ products, concurrency, canPublish, publishRequested }: Props) {
  const router = useRouter();
  const byCode = useMemo(
    () => new Map(products.map((product) => [product.code.toUpperCase(), product])),
    [products],
  );
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [modeFor, setModeFor] = useState<Record<string, "add" | "replace">>({});
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState<
    Record<string, { publishable: boolean; mode: "add" | "replace" }>
  >({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [publishing, startPublish] = useTransition();
  // Object URLs of the previews, revoked when the page closes.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = items.map((item) => item.url);
  }, [items]);

  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const choose = (list: FileList | null) => {
    if (list === null) return;
    items.forEach((item) => URL.revokeObjectURL(item.url));
    const next = [...list]
      .filter((file) => !file.name.startsWith("."))
      .map((file, index) => ({
        id: `${index}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
        match: matchImageName(file.webkitRelativePath || file.name, byCode),
        conflict: false,
        status: "waiting" as FileStatus,
        error: null,
        upload: null,
      }));
    const conflicts = conflictingSlots(next.map((item) => item.match));
    for (const item of next) item.conflict = item.match.ok && conflicts.has(slotKey(item.match));
    setItems(next);
    setSaved({});
    setMessage(null);
  };

  const matched = items.filter((item) => item.match.ok && !item.conflict);
  const unmatched = items.filter((item) => !item.match.ok || item.conflict);
  const productIds = [
    ...new Set(matched.map((item) => (item.match as Extract<ImageMatch, { ok: true }>).productId)),
  ];
  const update = (id: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const run = async () => {
    setRunning(true);
    setMessage(null);
    // This click's view of every file; React state follows for the screen.
    const snapshot = items;
    const status = new Map(snapshot.map((item) => [item.id, item.status]));
    const uploads = new Map<string, UploadedImage>(
      snapshot.flatMap((item) => (item.upload === null ? [] : [[item.id, item.upload] as const])),
    );
    const set = (id: string, patch: Partial<Item>) => {
      if (patch.status !== undefined) status.set(id, patch.status);
      update(id, patch);
    };
    // Files already uploaded (a save that failed) are not sent again.
    const queue = snapshot.filter(
      (item) =>
        item.match.ok &&
        !item.conflict &&
        !uploads.has(item.id) &&
        (item.status === "waiting" || item.status === "failed"),
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++]!;
        set(item.id, { status: "uploading", error: null });
        try {
          const upload = await uploadImage(item.file);
          uploads.set(item.id, upload);
          set(item.id, { status: "uploaded", upload });
        } catch (error) {
          set(item.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Upload failed.",
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    // Save each product whose files are all up and not yet saved.
    let failedProducts = 0;
    for (const productId of productIds) {
      const pending = snapshot.filter(
        (item) =>
          item.match.ok &&
          !item.conflict &&
          item.match.productId === productId &&
          status.get(item.id) !== "saved",
      );
      if (pending.length === 0 || pending.some((item) => !uploads.has(item.id))) continue;
      // After a replace, later files are added to what was saved.
      const productMode = saved[productId] !== undefined ? "add" : (modeFor[productId] ?? mode);
      const result = await attachBulkImagesAction({
        productId,
        mode: productMode,
        images: pending.map((item) => {
          const match = item.match as Extract<ImageMatch, { ok: true }>;
          return { upload: uploads.get(item.id), colourId: match.colourId, order: match.order };
        }),
      });
      if (result.status === "error") {
        failedProducts += 1;
        for (const item of pending) set(item.id, { status: "failed", error: result.message });
        continue;
      }
      for (const item of pending) set(item.id, { status: "saved" });
      setSaved((current) => ({
        ...current,
        [productId]: { publishable: result.data.publishable, mode: productMode },
      }));
    }
    setRunning(false);
    const failedFiles = [...status.values()].filter((value) => value === "failed").length;
    setMessage(
      failedFiles === 0 && failedProducts === 0
        ? { ok: true, text: "All images saved." }
        : { ok: false, text: `${failedFiles} file(s) failed. Retry sends only those.` },
    );
    router.refresh();
  };

  const publishable = Object.entries(saved).flatMap(([productId, value]) =>
    value.publishable && byId.get(productId)?.status === "DRAFT" ? [productId] : [],
  );
  const requestedFirst = [...publishable].sort(
    (a, b) => Number(publishRequested.includes(b)) - Number(publishRequested.includes(a)),
  );
  const publish = () =>
    startPublish(async () => {
      const result = await changeProductStatusAction({
        productIds: requestedFirst,
        status: "PUBLISHED",
      });
      setMessage({ ok: result.status === "success", text: result.message });
      router.refresh();
    });

  const counts = {
    done: items.filter((item) => item.status === "saved").length,
    failed: items.filter((item) => item.status === "failed").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-5">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
          <FolderOpen aria-hidden="true" className="size-4" />
          Choose a folder
          <input
            type="file"
            className="sr-only"
            multiple
            accept={IMAGE_ACCEPT}
            // @ts-expect-error -- non-standard but supported by every current browser
            webkitdirectory=""
            onChange={(event) => choose(event.target.files)}
            disabled={running}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
          <ImagePlus aria-hidden="true" className="size-4" />
          Choose images
          <input
            type="file"
            className="sr-only"
            multiple
            accept={IMAGE_ACCEPT}
            data-testid="bulk-images-files"
            onChange={(event) => choose(event.target.files)}
            disabled={running}
          />
        </label>
        <div className="min-w-56">
          <Label htmlFor="bulk-mode">Existing images</Label>
          <Select
            id="bulk-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as "add" | "replace")}
          >
            <option value="add">Add after them</option>
            <option value="replace">Replace them</option>
          </Select>
        </div>
        <p className="w-full text-xs text-muted-foreground" lang="bn">
          নাম: <code>{"{product_code}_1.jpg"}</code> (১ = মূল ছবি) বা{" "}
          <code>{"{product_code}_{রঙের কোড}_2.jpg"}</code>। JPG, PNG, WebP।
        </p>
      </section>

      {items.length === 0 ? null : (
        <>
          <section aria-labelledby="matched-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="matched-title" className="text-base font-semibold">
                Matched ({matched.length}) · {productIds.length} product
                {productIds.length === 1 ? "" : "s"}
              </h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={run}
                  disabled={running || matched.every((item) => item.status === "saved")}
                  data-testid="bulk-images-upload"
                >
                  {running ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : counts.failed > 0 ? (
                    <RotateCcw aria-hidden="true" />
                  ) : (
                    <Upload aria-hidden="true" />
                  )}
                  {counts.failed > 0 ? `Retry ${counts.failed} failed` : `Upload ${matched.length}`}
                </Button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm" data-testid="bulk-images-table">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">Image</th>
                    <th className="px-3 py-2 text-start font-medium">File</th>
                    <th className="px-3 py-2 text-start font-medium">Product</th>
                    <th className="px-3 py-2 text-start font-medium">Colour</th>
                    <th className="px-3 py-2 text-end font-medium">No.</th>
                    <th className="px-3 py-2 text-start font-medium">Existing</th>
                    <th className="px-3 py-2 text-start font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matched.map((item) => {
                    const match = item.match as Extract<ImageMatch, { ok: true }>;
                    const product = byId.get(match.productId);
                    return (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a chosen file */}
                          <img src={item.url} alt="" className="size-12 rounded object-cover" />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{item.file.name}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">{match.code}</span>
                          <span className="block text-xs text-muted-foreground">
                            {product?.nameEn}
                          </span>
                        </td>
                        <td className="px-3 py-2">{match.colourCode ?? "—"}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{match.order}</td>
                        <td className="px-3 py-2">
                          {product?.imageCount ?? 0}{" "}
                          {(product?.imageCount ?? 0) > 0 &&
                          saved[match.productId] === undefined ? (
                            <select
                              aria-label={`Existing images of ${match.code}`}
                              className="ms-1 rounded border border-input bg-background px-1 text-xs"
                              value={modeFor[match.productId] ?? mode}
                              onChange={(event) =>
                                setModeFor((current) => ({
                                  ...current,
                                  [match.productId]: event.target.value as "add" | "replace",
                                }))
                              }
                            >
                              <option value="add">add</option>
                              <option value="replace">replace</option>
                            </select>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={item.status} />
                          {item.error === null ? null : (
                            <span className="block text-xs text-destructive">{item.error}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {unmatched.length === 0 ? null : (
            <section aria-labelledby="unmatched-title">
              <h2 id="unmatched-title" className="text-base font-semibold">
                Not used ({unmatched.length})
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="bulk-images-unmatched">
                {unmatched.map((item) => (
                  <li key={item.id}>
                    <span className="font-mono text-xs">{item.file.name}</span> —{" "}
                    <span className="text-destructive">
                      {item.conflict
                        ? "Two files for the same place."
                        : item.match.ok
                          ? ""
                          : item.match.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          data-testid="bulk-images-message"
          className={
            message.ok ? "flex items-center gap-2 text-sm text-success" : "text-sm text-destructive"
          }
        >
          {message.ok ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
          {message.text}
        </p>
      )}

      {canPublish && publishable.length > 0 ? (
        <section
          className="rounded-lg border border-border bg-background p-5"
          data-testid="bulk-images-publish"
        >
          <h2 className="text-base font-semibold">Ready to publish</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These drafts now have images and meet every publishing rule.
          </p>
          <ul className="mt-2 text-sm">
            {requestedFirst.map((productId) => (
              <li key={productId}>
                <span className="font-mono text-xs">{byId.get(productId)?.code}</span>{" "}
                {byId.get(productId)?.nameEn}
                {publishRequested.includes(productId) ? (
                  <Badge variant="muted" className="ms-2">
                    import asked to publish
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-3" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Publish {publishable.length} product{publishable.length === 1 ? "" : "s"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const map: Record<
    FileStatus,
    { label: string; variant: "muted" | "outline" | "success" | "destructive" }
  > = {
    waiting: { label: "Waiting", variant: "outline" },
    uploading: { label: "Uploading", variant: "muted" },
    uploaded: { label: "Uploaded", variant: "muted" },
    saved: { label: "Saved", variant: "success" },
    failed: { label: "Failed", variant: "destructive" },
  };
  return <Badge variant={map[status].variant}>{map[status].label}</Badge>;
}
