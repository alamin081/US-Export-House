"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { deleteBrandAction, saveBrandAction } from "@/modules/catalog/catalog.actions";
import { slugify } from "@/modules/catalog/slug";
import type { UploadedImage } from "@/modules/media/media.service";
import { ErrorSummary, MissingBengali, TextAreaField, TextField } from "../catalogue/fields";
import { SingleImageField } from "../catalogue/single-image-field";
import { useUnsavedChangesWarning } from "../catalogue/use-unsaved-changes";

export interface BrandFormInitial {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  logoUrl: string | null;
  isActive: boolean;
  productCount: number;
}

export function BrandForm({
  initial,
  mockStorage,
  canDelete,
}: {
  initial: BrandFormInitial | null;
  mockStorage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseline] = useState(() => ({
    slug: initial?.slug ?? "",
    nameEn: initial?.nameEn ?? "",
    nameBn: initial?.nameBn ?? "",
    descriptionEn: initial?.descriptionEn ?? "",
    descriptionBn: initial?.descriptionBn ?? "",
    isActive: initial?.isActive ?? true,
    logoUpload: undefined as UploadedImage | undefined,
    removeLogo: false,
  }));
  const [state, setState] = useState(baseline);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );
  useUnsavedChangesWarning(dirty && !pending);

  const set = <K extends keyof typeof state>(key: K, value: (typeof state)[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const { logoUpload, ...rest } = state;
      const result = await saveBrandAction({
        ...(initial === null ? {} : { id: initial.id }),
        ...rest,
        ...(logoUpload === undefined ? {} : { logoUpload }),
      });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      router.push("/admin/brands");
      router.refresh();
    });

  const remove = () => {
    if (initial === null || !window.confirm(`Delete the brand "${initial.nameEn}"?`)) return;
    startTransition(async () => {
      const result = await deleteBrandAction(initial.id);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      router.push("/admin/brands");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Name (English)"
          required
          value={state.nameEn}
          error={fieldErrors.nameEn}
          onChange={(value) =>
            setState((current) => ({
              ...current,
              nameEn: value,
              ...(initial === null && current.slug === slugify(current.nameEn)
                ? { slug: slugify(value) }
                : {}),
            }))
          }
        />
        <div>
          <TextField
            label="Name (Bengali)"
            lang="bn"
            value={state.nameBn}
            error={fieldErrors.nameBn}
            onChange={(value) => set("nameBn", value)}
          />
          <MissingBengali show={state.nameBn.trim() === ""} className="mt-2" />
        </div>
        <TextField
          label="Slug"
          required
          value={state.slug}
          error={fieldErrors.slug}
          onChange={(value) => set("slug", value)}
        />
        <label className="flex items-center gap-2 self-end text-sm">
          <Checkbox
            checked={state.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
          Active
        </label>
        <TextAreaField
          label="Description (English)"
          value={state.descriptionEn}
          onChange={(value) => set("descriptionEn", value)}
          rows={3}
        />
        <TextAreaField
          label="Description (Bengali)"
          lang="bn"
          value={state.descriptionBn}
          onChange={(value) => set("descriptionBn", value)}
          rows={3}
        />
        <SingleImageField
          label="Logo"
          currentUrl={initial?.logoUrl ?? null}
          upload={state.logoUpload}
          removed={state.removeLogo}
          onUpload={(image) =>
            setState((current) => ({ ...current, logoUpload: image, removeLogo: false }))
          }
          onRemove={() =>
            setState((current) => ({ ...current, logoUpload: undefined, removeLogo: true }))
          }
          mockStorage={mockStorage}
          error={fieldErrors.logoUpload}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save brand
        </Button>
        {initial !== null && canDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={remove}
            disabled={pending || initial.productCount > 0}
            title={
              initial.productCount > 0 ? "Brands with products can only be deactivated." : undefined
            }
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
