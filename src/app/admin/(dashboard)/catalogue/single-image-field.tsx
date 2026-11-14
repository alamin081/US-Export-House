"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import type { UploadedImage } from "@/modules/media/media.service";
import { MockStorageBadge } from "./fields";
import { ACCEPT_ATTRIBUTE, uploadImage } from "./upload-image";

/** One optional image (category picture, brand logo): upload, replace or remove. */
export function SingleImageField({
  label,
  currentUrl,
  upload,
  removed,
  onUpload,
  onRemove,
  mockStorage,
  error,
}: {
  label: string;
  currentUrl: string | null;
  upload: UploadedImage | undefined;
  removed: boolean;
  onUpload: (image: UploadedImage) => void;
  onRemove: () => void;
  mockStorage: boolean;
  error?: string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const shown = upload?.url ?? (removed ? null : currentUrl);

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className="aspect-[4/3] w-32 overflow-hidden rounded-md bg-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
          {shown === null ? null : <img src={shown} alt="" className="size-full object-contain" />}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-secondary">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-3.5" />
            )}
            {shown === null ? "Upload" : "Replace"}
            <input
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file === undefined) return;
                setBusy(true);
                setUploadError(null);
                try {
                  onUpload(await uploadImage(file));
                } catch (failure) {
                  setUploadError(failure instanceof Error ? failure.message : "Upload failed.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {shown === null ? null : (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          )}
          <MockStorageBadge show={mockStorage} />
        </div>
      </div>
      {(uploadError ?? error) ? (
        <FieldHint tone="error" role="alert">
          {uploadError ?? error}
        </FieldHint>
      ) : null}
    </div>
  );
}
