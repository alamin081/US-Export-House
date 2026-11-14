"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveCategoryAction } from "@/modules/catalog/catalog.actions";
import { slugify } from "@/modules/catalog/slug";
import type { UploadedImage } from "@/modules/media/media.service";
import { ErrorSummary, MissingBengali, TextAreaField, TextField } from "../catalogue/fields";
import { SingleImageField } from "../catalogue/single-image-field";
import { useUnsavedChangesWarning } from "../catalogue/use-unsaved-changes";

export interface CategoryFormInitial {
  id: string;
  slug: string;
  code: string | null;
  nameEn: string;
  nameBn: string | null;
  taglineEn: string | null;
  taglineBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  seoTitleEn: string | null;
  seoTitleBn: string | null;
  seoDescriptionEn: string | null;
  seoDescriptionBn: string | null;
  parentId: string | null;
  sizeChartId: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

const TEXT_KEYS = [
  "nameEn",
  "nameBn",
  "taglineEn",
  "taglineBn",
  "descriptionEn",
  "descriptionBn",
  "seoTitleEn",
  "seoTitleBn",
  "seoDescriptionEn",
  "seoDescriptionBn",
] as const;
type TextKey = (typeof TEXT_KEYS)[number];

export function CategoryForm({
  initial,
  parents,
  sizeCharts,
  mockStorage,
}: {
  initial: CategoryFormInitial | null;
  /** Possible parents (the server re-checks cycles and depth). */
  parents: Array<{ id: string; label: string }>;
  sizeCharts: Array<{ id: string; nameEn: string }>;
  mockStorage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseline] = useState(() => ({
    text: Object.fromEntries(TEXT_KEYS.map((key) => [key, initial?.[key] ?? ""])) as Record<
      TextKey,
      string
    >,
    slug: initial?.slug ?? "",
    code: initial?.code ?? "",
    parentId: initial?.parentId ?? "",
    sizeChartId: initial?.sizeChartId ?? "",
    isActive: initial?.isActive ?? true,
    imageUpload: undefined as UploadedImage | undefined,
    removeImage: false,
  }));
  const [state, setState] = useState(baseline);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );
  useUnsavedChangesWarning(dirty && !pending);

  const setText = (key: TextKey, value: string) =>
    setState((current) => ({
      ...current,
      text: { ...current.text, [key]: value },
      ...(initial === null && key === "nameEn" && current.slug === slugify(current.text.nameEn)
        ? { slug: slugify(value) }
        : {}),
    }));

  const save = () =>
    startTransition(async () => {
      const result = await saveCategoryAction({
        ...(initial === null ? {} : { id: initial.id }),
        ...state.text,
        slug: state.slug,
        code: state.code,
        parentId: state.parentId === "" ? null : state.parentId,
        sizeChartId: state.sizeChartId === "" ? null : state.sizeChartId,
        isActive: state.isActive,
        ...(state.imageUpload === undefined ? {} : { imageUpload: state.imageUpload }),
        removeImage: state.removeImage,
      });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      router.push("/admin/categories");
      router.refresh();
    });

  const field = (key: TextKey, label: string, area = false) =>
    area ? (
      <TextAreaField
        key={key}
        label={label}
        lang={key.endsWith("Bn") ? "bn" : "en"}
        value={state.text[key]}
        error={fieldErrors[key]}
        onChange={(value) => setText(key, value)}
        rows={3}
      />
    ) : (
      <TextField
        key={key}
        label={label}
        required={key === "nameEn"}
        lang={key.endsWith("Bn") ? "bn" : "en"}
        value={state.text[key]}
        error={fieldErrors[key]}
        onChange={(value) => setText(key, value)}
      />
    );

  return (
    <div className="flex flex-col gap-6" data-testid="category-form">
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <div className="grid gap-5 sm:grid-cols-2">
        {field("nameEn", "Name (English)")}
        <div>
          {field("nameBn", "Name (Bengali)")}
          <MissingBengali show={state.text.nameBn.trim() === ""} className="mt-2" />
        </div>
        <TextField
          label="Slug"
          required
          value={state.slug}
          error={fieldErrors.slug}
          onChange={(value) => setState((current) => ({ ...current, slug: value }))}
        />
        <TextField
          label="Code (for product codes)"
          value={state.code}
          error={fieldErrors.code}
          hint="2–4 capital letters, e.g. SH → UEH-SH0012. Cannot change once set."
          disabled={initial?.code != null}
          onChange={(value) => setState((current) => ({ ...current, code: value.toUpperCase() }))}
        />
        <div>
          <Label htmlFor="parentId">Parent category</Label>
          <Select
            id="parentId"
            value={state.parentId}
            onChange={(event) =>
              setState((current) => ({ ...current, parentId: event.target.value }))
            }
          >
            <option value="">None (top level)</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.label}
              </option>
            ))}
          </Select>
          {fieldErrors.parentId === undefined ? null : (
            <FieldHint tone="error" role="alert">
              {fieldErrors.parentId}
            </FieldHint>
          )}
        </div>
        <div>
          <Label htmlFor="sizeChartId">Size chart</Label>
          <Select
            id="sizeChartId"
            value={state.sizeChartId}
            onChange={(event) =>
              setState((current) => ({ ...current, sizeChartId: event.target.value }))
            }
          >
            <option value="">None</option>
            {sizeCharts.map((chart) => (
              <option key={chart.id} value={chart.id}>
                {chart.nameEn}
              </option>
            ))}
          </Select>
        </div>
        {field("taglineEn", "Tagline (English)")}
        {field("taglineBn", "Tagline (Bengali)")}
        {field("descriptionEn", "Description (English)", true)}
        {field("descriptionBn", "Description (Bengali)", true)}
        {field("seoTitleEn", "SEO title (English)")}
        {field("seoTitleBn", "SEO title (Bengali)")}
        {field("seoDescriptionEn", "Meta description (English)", true)}
        {field("seoDescriptionBn", "Meta description (Bengali)", true)}
        <SingleImageField
          label="Image"
          currentUrl={initial?.imageUrl ?? null}
          upload={state.imageUpload}
          removed={state.removeImage}
          onUpload={(image) =>
            setState((current) => ({ ...current, imageUpload: image, removeImage: false }))
          }
          onRemove={() =>
            setState((current) => ({ ...current, imageUpload: undefined, removeImage: true }))
          }
          mockStorage={mockStorage}
          error={fieldErrors.imageUpload}
        />
        <label className="flex items-center gap-2 self-end text-sm">
          <Checkbox
            checked={state.isActive}
            onChange={(event) =>
              setState((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          Active (shown on the storefront)
        </label>
      </div>
      <div>
        <Button type="button" onClick={save} disabled={pending} data-testid="save-category">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save category
        </Button>
      </div>
    </div>
  );
}
