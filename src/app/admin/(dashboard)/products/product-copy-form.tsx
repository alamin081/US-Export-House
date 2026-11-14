"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProductDraftAction, saveProductCopyAction } from "@/modules/catalog/catalog.actions";
import type { ProductEditView } from "@/modules/catalog/product.service";
import { slugify } from "@/modules/catalog/slug";
import { ErrorSummary, MissingBengali, TextAreaField, TextField } from "../catalogue/fields";
import { useUnsavedChangesWarning } from "../catalogue/use-unsaved-changes";

/**
 * Copy-only form for Content Editors: names, descriptions, fabric, care, SEO
 * and image alt text. Prices, variants, status and categories are not
 * editable here (the server refuses them anyway). In "draft" mode it creates
 * a new draft with a category, ready for a manager to add variants and prices.
 */

const COPY_FIELDS = [
  ["nameEn", "Name (English)", "input"],
  ["nameBn", "Name (Bengali)", "input"],
  ["summaryEn", "Summary (English)", "area"],
  ["summaryBn", "Summary (Bengali)", "area"],
  ["descriptionEn", "Description (English)", "area"],
  ["descriptionBn", "Description (Bengali)", "area"],
  ["fabricEn", "Fabric (English)", "input"],
  ["fabricBn", "Fabric (Bengali)", "input"],
  ["careEn", "Care (English, one per line)", "area"],
  ["careBn", "Care (Bengali, one per line)", "area"],
  ["seoTitleEn", "SEO title (English)", "input"],
  ["seoTitleBn", "SEO title (Bengali)", "input"],
  ["seoDescriptionEn", "Meta description (English)", "area"],
  ["seoDescriptionBn", "Meta description (Bengali)", "area"],
] as const;

type CopyKey = (typeof COPY_FIELDS)[number][0];
type CopyState = Record<CopyKey, string>;

function emptyCopy(): CopyState {
  return Object.fromEntries(COPY_FIELDS.map(([key]) => [key, ""])) as CopyState;
}

export function ProductCopyForm({
  initial,
  categories,
}: {
  /** null: create a new draft. */
  initial: ProductEditView | null;
  categories: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseline] = useState(() => ({
    copy:
      initial === null
        ? emptyCopy()
        : (Object.fromEntries(COPY_FIELDS.map(([key]) => [key, initial[key]])) as CopyState),
    images: (initial?.images ?? []).map((image) => ({
      id: image.id,
      url: image.url,
      altEn: image.altEn,
      altBn: image.altBn,
    })),
    slug: initial?.slug ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? "",
  }));
  const [state, setState] = useState(baseline);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );
  useUnsavedChangesWarning(dirty && !pending);

  const setCopy = (key: CopyKey, value: string) =>
    setState((current) => ({
      ...current,
      copy: { ...current.copy, [key]: value },
      ...(initial === null && key === "nameEn" && current.slug === slugify(current.copy.nameEn)
        ? { slug: slugify(value) }
        : {}),
    }));

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      const result =
        initial === null
          ? await createProductDraftAction({
              ...state.copy,
              slug: state.slug,
              categoryId: state.categoryId,
            })
          : await saveProductCopyAction({
              ...state.copy,
              id: initial.id,
              version: initial.version,
              images: state.images.map(({ id, altEn, altBn }) => ({ id, altEn, altBn })),
            });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      setFieldErrors({});
      if (initial === null) router.replace(`/admin/products/${result.data.id}?saved=1`);
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-6" data-testid="product-copy-form">
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <p className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
        You can edit the product copy and image alt text. Prices, variants, images and publishing
        are handled by a store manager.
      </p>

      {initial === null ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Slug (URL)"
            required
            value={state.slug}
            error={fieldErrors.slug}
            onChange={(value) => setState((current) => ({ ...current, slug: value }))}
          />
          <div>
            <Label htmlFor="draft-category" required>
              Main category
            </Label>
            <Select
              id="draft-category"
              value={state.categoryId}
              onChange={(event) =>
                setState((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
            {fieldErrors.categoryId === undefined ? null : (
              <FieldHint tone="error">{fieldErrors.categoryId}</FieldHint>
            )}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {COPY_FIELDS.map(([key, label, kind]) =>
          kind === "input" ? (
            <TextField
              key={key}
              label={label}
              required={key === "nameEn"}
              lang={key.endsWith("Bn") ? "bn" : "en"}
              value={state.copy[key]}
              error={fieldErrors[key]}
              onChange={(value) => setCopy(key, value)}
            />
          ) : (
            <TextAreaField
              key={key}
              label={label}
              lang={key.endsWith("Bn") ? "bn" : "en"}
              value={state.copy[key]}
              error={fieldErrors[key]}
              rows={key.startsWith("description") ? 6 : 3}
              onChange={(value) => setCopy(key, value)}
            />
          ),
        )}
      </div>
      <MissingBengali show={state.copy.nameBn.trim() === ""} />

      {state.images.length === 0 ? null : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Image alt text</legend>
          {state.images.map((image, index) => (
            <div
              key={image.id}
              className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[4rem_1fr_1fr]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
              <img
                src={image.url}
                alt=""
                className="aspect-[4/5] w-16 rounded bg-secondary object-contain"
              />
              <TextField
                label={`Alt (English) #${index + 1}`}
                value={image.altEn}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    images: current.images.map((candidate) =>
                      candidate.id === image.id ? { ...candidate, altEn: value } : candidate,
                    ),
                  }))
                }
              />
              <TextField
                label={`Alt (Bengali) #${index + 1}`}
                lang="bn"
                value={image.altBn}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    images: current.images.map((candidate) =>
                      candidate.id === image.id ? { ...candidate, altBn: value } : candidate,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </fieldset>
      )}

      <div>
        <Button type="button" onClick={save} disabled={pending} data-testid="save-copy">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {initial === null ? "Create draft" : "Save copy"}
        </Button>
      </div>
    </div>
  );
}
