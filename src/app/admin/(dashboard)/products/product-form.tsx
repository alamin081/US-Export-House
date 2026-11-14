"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTakaInput, parseTakaInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveProductAction } from "@/modules/catalog/catalog.actions";
import type { ProductEditView } from "@/modules/catalog/product.service";
import { missingForPublish, PUBLISH_REQUIREMENT_LABELS } from "@/modules/catalog/publish-rules";
import { slugify } from "@/modules/catalog/slug";
import { renderSku } from "@/modules/catalog/sku";
import type { UploadedImage } from "@/modules/media/media.service";
import {
  ErrorSummary,
  MissingBengali,
  MockStorageBadge,
  TextAreaField,
  TextField,
} from "../catalogue/fields";
import { ACCEPT_ATTRIBUTE, uploadImage } from "../catalogue/upload-image";
import { useUnsavedChangesWarning } from "../catalogue/use-unsaved-changes";

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface ProductFormReferences {
  categories: Array<{ id: string; label: string; code: string | null; isActive: boolean }>;
  brands: Array<{ id: string; nameEn: string; isActive: boolean }>;
  sizeCharts: Array<{ id: string; nameEn: string }>;
  tags: Array<{ id: string; nameEn: string; nameBn: string | null }>;
  presets: Array<{
    id: string;
    type: "SIZE" | "COLOUR";
    group: string;
    code: string;
    valueEn: string;
    valueBn: string | null;
    hex: string | null;
  }>;
  fits: Array<{ key: string; en: string; bn?: string | undefined }>;
  skuPattern: string;
}

interface VariantRow {
  key: string;
  id?: string;
  sizeRef: string | null;
  colourRef: string | null;
  sku: string;
  barcode: string;
  price: string;
  comparePrice: string;
  weight: string;
  isActive: boolean;
  onHand?: number;
  reserved?: number;
}

interface ImageRow {
  key: string;
  id?: string;
  upload?: UploadedImage;
  url: string;
  altEn: string;
  altBn: string;
  colourRef: string | null;
}

interface FormState {
  nameEn: string;
  nameBn: string;
  slug: string;
  slugTouched: boolean;
  summaryEn: string;
  summaryBn: string;
  descriptionEn: string;
  descriptionBn: string;
  fabricEn: string;
  fabricBn: string;
  careEn: string;
  careBn: string;
  seoTitleEn: string;
  seoTitleBn: string;
  seoDescriptionEn: string;
  seoDescriptionBn: string;
  categoryId: string;
  extraCategoryIds: string[];
  brandId: string;
  sizeChartId: string;
  fit: string;
  tagIds: string[];
  isNew: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  sizes: string[];
  colours: string[];
  variants: VariantRow[];
  images: ImageRow[];
}

interface OptionChoice {
  ref: string;
  type: "SIZE" | "COLOUR";
  group: string;
  code: string;
  label: string;
  hex: string | null;
  existing: boolean;
}

let keyCounter = 0;
const nextKey = () => `k${(keyCounter += 1)}`;

function initialState(initial: ProductEditView | null, defaultCategoryId: string): FormState {
  if (initial === null) {
    return {
      nameEn: "",
      nameBn: "",
      slug: "",
      slugTouched: false,
      summaryEn: "",
      summaryBn: "",
      descriptionEn: "",
      descriptionBn: "",
      fabricEn: "",
      fabricBn: "",
      careEn: "",
      careBn: "",
      seoTitleEn: "",
      seoTitleBn: "",
      seoDescriptionEn: "",
      seoDescriptionBn: "",
      categoryId: defaultCategoryId,
      extraCategoryIds: [],
      brandId: "",
      sizeChartId: "",
      fit: "",
      tagIds: [],
      isNew: true,
      isFeatured: false,
      isBestseller: false,
      sizes: [],
      colours: [],
      variants: [],
      images: [],
    };
  }
  const usedSizes = new Set(initial.variants.map((variant) => variant.sizeRef).filter(Boolean));
  const usedColours = new Set(initial.variants.map((variant) => variant.colourRef).filter(Boolean));
  return {
    nameEn: initial.nameEn,
    nameBn: initial.nameBn,
    slug: initial.slug,
    slugTouched: true,
    summaryEn: initial.summaryEn,
    summaryBn: initial.summaryBn,
    descriptionEn: initial.descriptionEn,
    descriptionBn: initial.descriptionBn,
    fabricEn: initial.fabricEn,
    fabricBn: initial.fabricBn,
    careEn: initial.careEn,
    careBn: initial.careBn,
    seoTitleEn: initial.seoTitleEn,
    seoTitleBn: initial.seoTitleBn,
    seoDescriptionEn: initial.seoDescriptionEn,
    seoDescriptionBn: initial.seoDescriptionBn,
    categoryId: initial.categoryId,
    extraCategoryIds: initial.extraCategoryIds,
    brandId: initial.brandId ?? "",
    sizeChartId: initial.sizeChartId ?? "",
    fit: initial.fit ?? "",
    tagIds: initial.tagIds,
    isNew: initial.isNew,
    isFeatured: initial.isFeatured,
    isBestseller: initial.isBestseller,
    sizes: initial.sizes.filter((value) => usedSizes.has(value.id)).map((value) => value.id),
    colours: initial.colours.filter((value) => usedColours.has(value.id)).map((value) => value.id),
    variants: initial.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      sizeRef: variant.sizeRef,
      colourRef: variant.colourRef,
      sku: variant.sku,
      barcode: variant.barcode,
      price: formatTakaInput(variant.pricePoisha),
      comparePrice:
        variant.comparePricePoisha === null ? "" : formatTakaInput(variant.comparePricePoisha),
      weight: variant.weightGrams === null ? "" : String(variant.weightGrams),
      isActive: variant.isActive,
      onHand: variant.onHand,
      reserved: variant.reserved,
    })),
    images: initial.images.map((image) => ({
      key: image.id,
      id: image.id,
      url: image.url,
      altEn: image.altEn,
      altBn: image.altBn,
      colourRef: image.colourRef,
    })),
  };
}

function payloadOf(state: FormState, initial: ProductEditView | null) {
  return {
    ...(initial === null ? {} : { id: initial.id, version: initial.version }),
    nameEn: state.nameEn,
    nameBn: state.nameBn,
    slug: state.slug,
    summaryEn: state.summaryEn,
    summaryBn: state.summaryBn,
    descriptionEn: state.descriptionEn,
    descriptionBn: state.descriptionBn,
    fabricEn: state.fabricEn,
    fabricBn: state.fabricBn,
    careEn: state.careEn,
    careBn: state.careBn,
    seoTitleEn: state.seoTitleEn,
    seoTitleBn: state.seoTitleBn,
    seoDescriptionEn: state.seoDescriptionEn,
    seoDescriptionBn: state.seoDescriptionBn,
    categoryId: state.categoryId,
    extraCategoryIds: state.extraCategoryIds,
    brandId: state.brandId === "" ? null : state.brandId,
    sizeChartId: state.sizeChartId === "" ? null : state.sizeChartId,
    fit: state.fit === "" ? null : state.fit,
    tagIds: state.tagIds,
    isNew: state.isNew,
    isFeatured: state.isFeatured,
    isBestseller: state.isBestseller,
    sizes: state.sizes.map((ref) => ({ ref })),
    colours: state.colours.map((ref) => ({ ref })),
    variants: state.variants.map((row) => ({
      ...(row.id === undefined ? {} : { id: row.id }),
      sizeRef: row.sizeRef,
      colourRef: row.colourRef,
      sku: row.sku,
      barcode: row.barcode,
      price: row.price,
      comparePrice: row.comparePrice,
      weightGrams: row.weight.trim() === "" ? null : Number(row.weight),
      isActive: row.isActive,
    })),
    images: state.images.map((image) =>
      image.id === undefined
        ? {
            upload: image.upload,
            altEn: image.altEn,
            altBn: image.altBn,
            colourRef: image.colourRef,
          }
        : { id: image.id, altEn: image.altEn, altBn: image.altBn, colourRef: image.colourRef },
    ),
  };
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export function ProductForm({
  initial,
  references,
  canPrice,
  mockStorage,
}: {
  initial: ProductEditView | null;
  references: ProductFormReferences;
  canPrice: boolean;
  mockStorage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const firstCategory = references.categories.find((category) => category.isActive)?.id ?? "";
  const [baseline] = useState(() => initialState(initial, firstCategory));
  const [state, setState] = useState<FormState>(baseline);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );
  useUnsavedChangesWarning(dirty && !pending);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));
  const error = (path: string) => fieldErrors[path];

  // --- option choices: this product's values plus the preset library ---------
  const choices = useMemo<OptionChoice[]>(() => {
    const list: OptionChoice[] = [];
    for (const [type, values] of [
      ["SIZE", initial?.sizes ?? []],
      ["COLOUR", initial?.colours ?? []],
    ] as const) {
      for (const value of values) {
        list.push({
          ref: value.id,
          type,
          group: "this product",
          code:
            value.code ??
            value.valueEn
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
              .slice(0, 3),
          label: value.valueBn === null ? value.valueEn : `${value.valueEn} / ${value.valueBn}`,
          hex: value.hex,
          existing: true,
        });
      }
    }
    for (const preset of references.presets) {
      const duplicate = list.some(
        (choice) =>
          choice.existing &&
          choice.type === preset.type &&
          choice.label.split(" / ")[0] === preset.valueEn,
      );
      if (duplicate) continue;
      list.push({
        ref: `preset:${preset.id}`,
        type: preset.type,
        group: preset.group,
        code: preset.code,
        label: preset.valueBn === null ? preset.valueEn : `${preset.valueEn} / ${preset.valueBn}`,
        hex: preset.hex,
        existing: false,
      });
    }
    return list;
  }, [initial, references.presets]);
  const choiceByRef = useMemo(
    () => new Map(choices.map((choice) => [choice.ref, choice])),
    [choices],
  );
  const labelOf = (ref: string | null) =>
    ref === null ? "—" : (choiceByRef.get(ref)?.label ?? ref);

  const category = references.categories.find((candidate) => candidate.id === state.categoryId);
  const skuPreview = (row: VariantRow) => {
    const code = initial?.code ?? (category?.code == null ? null : `UEH-${category.code}####`);
    if (code === null) return "Enter a SKU";
    return renderSku(references.skuPattern, {
      productCode: code,
      colour: row.colourRef === null ? null : (choiceByRef.get(row.colourRef)?.code ?? null),
      size: row.sizeRef === null ? null : (choiceByRef.get(row.sizeRef)?.code ?? null),
    });
  };

  const toggleOption = (type: "SIZE" | "COLOUR", ref: string, on: boolean) => {
    setState((current) => {
      const field = type === "SIZE" ? "sizes" : "colours";
      const selected = on
        ? [...current[field], ref]
        : current[field].filter((value) => value !== ref);
      // New, unsaved rows that used an unticked value go with it.
      const variants = on
        ? current.variants
        : current.variants.filter(
            (row) =>
              row.id !== undefined || (type === "SIZE" ? row.sizeRef : row.colourRef) !== ref,
          );
      return { ...current, [field]: selected, variants };
    });
  };

  /** Adds every selected size x colour combination that has no row yet. */
  const generateMatrix = () => {
    setState((current) => {
      const sizes: Array<string | null> = current.sizes.length === 0 ? [null] : current.sizes;
      const colours: Array<string | null> = current.colours.length === 0 ? [null] : current.colours;
      const existing = new Set(current.variants.map((row) => `${row.sizeRef}|${row.colourRef}`));
      const added: VariantRow[] = [];
      for (const sizeRef of sizes) {
        for (const colourRef of colours) {
          if (existing.has(`${sizeRef}|${colourRef}`)) continue;
          added.push({
            key: nextKey(),
            sizeRef,
            colourRef,
            sku: "",
            barcode: "",
            price: current.variants[0]?.price ?? "",
            comparePrice: current.variants[0]?.comparePrice ?? "",
            weight: current.variants[0]?.weight ?? "",
            isActive: true,
          });
        }
      }
      return { ...current, variants: [...current.variants, ...added] };
    });
  };

  const updateVariant = (key: string, patch: Partial<VariantRow>) =>
    setState((current) => ({
      ...current,
      variants: current.variants.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  const removeVariant = (key: string) =>
    setState((current) => ({
      ...current,
      variants: current.variants.filter((row) => row.key !== key),
    }));

  const applyToAll = (field: "price" | "comparePrice" | "weight") =>
    setState((current) => {
      const value = current.variants[0]?.[field] ?? "";
      return { ...current, variants: current.variants.map((row) => ({ ...row, [field]: value })) };
    });

  // --- images -------------------------------------------------------------------
  const onFiles = async (files: FileList | null) => {
    if (files === null) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      setUploading((count) => count + 1);
      try {
        const upload = await uploadImage(file);
        setState((current) => ({
          ...current,
          images: [
            ...current.images,
            {
              key: nextKey(),
              upload,
              url: upload.url,
              altEn: current.nameEn,
              altBn: current.nameBn,
              colourRef: null,
            },
          ],
        }));
      } catch (uploadFailure) {
        setUploadError(uploadFailure instanceof Error ? uploadFailure.message : "Upload failed.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const moveImage = (index: number, delta: -1 | 1) =>
    setState((current) => {
      const images = [...current.images];
      const target = index + delta;
      if (target < 0 || target >= images.length) return current;
      [images[index], images[target]] = [images[target] as ImageRow, images[index] as ImageRow];
      return { ...current, images };
    });

  const updateImage = (key: string, patch: Partial<ImageRow>) =>
    setState((current) => ({
      ...current,
      images: current.images.map((image) => (image.key === key ? { ...image, ...patch } : image)),
    }));

  // --- publish checklist, live ----------------------------------------------------
  const missing = missingForPublish({
    nameEn: state.nameEn,
    nameBn: state.nameBn,
    imageCount: state.images.length,
    variants: state.variants.map((row) => ({
      isActive: row.isActive,
      deleted: false,
      pricePoisha: parseTakaInput(row.price) ?? 0,
    })),
  });

  // --- save --------------------------------------------------------------------------
  const save = () => {
    setMessage(null);
    setConflict(false);
    startTransition(async () => {
      const result = await saveProductAction(payloadOf(state, initial));
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        setConflict(result.conflict === true);
        return;
      }
      setFieldErrors({});
      if (initial === null) {
        router.replace(`/admin/products/${result.data.id}?saved=1`);
      } else {
        // The page re-renders with the new version; the form remounts on it.
        router.refresh();
      }
    });
  };

  const colourChoices = state.colours
    .map((ref) => choiceByRef.get(ref))
    .filter((choice) => choice !== undefined);
  const tabError = (prefixes: string[]) =>
    Object.keys(fieldErrors).some((path) =>
      prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
    );

  const sizeGroups = groupChoices(choices.filter((choice) => choice.type === "SIZE"));
  const colourGroups = groupChoices(choices.filter((choice) => choice.type === "COLOUR"));

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_18rem]" data-testid="product-form">
      <div className="min-w-0">
        {conflict ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-medium text-destructive">{message}</p>
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={() => window.location.reload()}
            >
              Reload the latest version (your unsaved edits will be lost)
            </button>
          </div>
        ) : (
          <ErrorSummary message={message} fieldErrors={fieldErrors} />
        )}

        <Tabs defaultValue="info" className="mt-2">
          <TabsList aria-label="Product sections">
            <TabsTrigger value="info">
              Information
              {tabError([
                "nameEn",
                "nameBn",
                "slug",
                "categoryId",
                "extraCategoryIds",
                "brandId",
                "fit",
                "tagIds",
                "sizeChartId",
              ]) ? (
                <Dot />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="variants">
              Variants ({state.variants.length})
              {tabError(["variants", "sizes", "colours"]) ? <Dot /> : null}
            </TabsTrigger>
            <TabsTrigger value="images">
              Images ({state.images.length}){tabError(["images"]) ? <Dot /> : null}
            </TabsTrigger>
            <TabsTrigger value="seo">
              SEO
              {tabError(["seoTitleEn", "seoTitleBn", "seoDescriptionEn", "seoDescriptionBn"]) ? (
                <Dot />
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------------ info */}
          <TabsContent value="info" className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Name (English)"
              name="nameEn"
              required
              value={state.nameEn}
              error={error("nameEn")}
              onChange={(value) =>
                setState((current) => ({
                  ...current,
                  nameEn: value,
                  ...(current.slugTouched ? {} : { slug: slugify(value) }),
                }))
              }
            />
            <div>
              <TextField
                label="Name (Bengali)"
                name="nameBn"
                lang="bn"
                value={state.nameBn}
                error={error("nameBn")}
                onChange={(value) => set("nameBn", value)}
              />
              <MissingBengali show={state.nameBn.trim() === ""} className="mt-2" />
            </div>
            <TextField
              label="Slug (URL)"
              name="slug"
              required
              value={state.slug}
              error={error("slug")}
              hint="Suggested from the English name. Used in both languages."
              onChange={(value) =>
                setState((current) => ({ ...current, slug: value, slugTouched: true }))
              }
              className="sm:col-span-2"
            />
            <div>
              <Label htmlFor="categoryId" required>
                Main category
              </Label>
              <Select
                id="categoryId"
                name="categoryId"
                value={state.categoryId}
                onChange={(event) => set("categoryId", event.target.value)}
                aria-invalid={error("categoryId") !== undefined || undefined}
              >
                {references.categories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.code === null ? " (no code)" : ` [${option.code}]`}
                    {option.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
              {error("categoryId") === undefined ? null : (
                <FieldHint tone="error" role="alert">
                  {error("categoryId")}
                </FieldHint>
              )}
            </div>
            <div>
              <Label htmlFor="brandId">Brand</Label>
              <Select
                id="brandId"
                value={state.brandId}
                onChange={(event) => set("brandId", event.target.value)}
              >
                <option value="">No brand</option>
                {references.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.nameEn}
                    {brand.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Also list in</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {references.categories
                  .filter((option) => option.id !== state.categoryId)
                  .map((option) => (
                    <label key={option.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={state.extraCategoryIds.includes(option.id)}
                        onChange={(event) =>
                          set(
                            "extraCategoryIds",
                            event.target.checked
                              ? [...state.extraCategoryIds, option.id]
                              : state.extraCategoryIds.filter((id) => id !== option.id),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="fit">Fit</Label>
              <Select
                id="fit"
                value={state.fit}
                onChange={(event) => set("fit", event.target.value)}
              >
                <option value="">Not set</option>
                {references.fits.map((fit) => (
                  <option key={fit.key} value={fit.key}>
                    {fit.en}
                    {fit.bn === undefined ? "" : ` / ${fit.bn}`}
                  </option>
                ))}
              </Select>
              {error("fit") === undefined ? null : (
                <FieldHint tone="error">{error("fit")}</FieldHint>
              )}
            </div>
            <div>
              <Label htmlFor="sizeChartId">Size chart</Label>
              <Select
                id="sizeChartId"
                value={state.sizeChartId}
                onChange={(event) => set("sizeChartId", event.target.value)}
              >
                <option value="">Use the category&apos;s chart</option>
                {references.sizeCharts.map((chart) => (
                  <option key={chart.id} value={chart.id}>
                    {chart.nameEn}
                  </option>
                ))}
              </Select>
            </div>
            <TextAreaField
              label="Summary (English)"
              value={state.summaryEn}
              onChange={(value) => set("summaryEn", value)}
              rows={2}
              error={error("summaryEn")}
            />
            <TextAreaField
              label="Summary (Bengali)"
              lang="bn"
              value={state.summaryBn}
              onChange={(value) => set("summaryBn", value)}
              rows={2}
              error={error("summaryBn")}
            />
            <TextAreaField
              label="Description (English)"
              hint="Separate paragraphs with a blank line."
              value={state.descriptionEn}
              onChange={(value) => set("descriptionEn", value)}
              rows={6}
              error={error("descriptionEn")}
            />
            <div>
              <TextAreaField
                label="Description (Bengali)"
                lang="bn"
                value={state.descriptionBn}
                onChange={(value) => set("descriptionBn", value)}
                rows={6}
                error={error("descriptionBn")}
              />
              <MissingBengali
                show={state.descriptionEn.trim() !== "" && state.descriptionBn.trim() === ""}
                className="mt-2"
              />
            </div>
            <TextField
              label="Fabric (English)"
              value={state.fabricEn}
              onChange={(value) => set("fabricEn", value)}
              error={error("fabricEn")}
            />
            <TextField
              label="Fabric (Bengali)"
              lang="bn"
              value={state.fabricBn}
              onChange={(value) => set("fabricBn", value)}
              error={error("fabricBn")}
            />
            <TextAreaField
              label="Care (English)"
              hint="One instruction per line."
              value={state.careEn}
              onChange={(value) => set("careEn", value)}
              error={error("careEn")}
            />
            <TextAreaField
              label="Care (Bengali)"
              lang="bn"
              value={state.careBn}
              onChange={(value) => set("careBn", value)}
              error={error("careBn")}
            />
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Tags</legend>
              {references.tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tags yet. Create them under Catalogue → Tags.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {references.tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={state.tagIds.includes(tag.id)}
                        onChange={(event) =>
                          set(
                            "tagIds",
                            event.target.checked
                              ? [...state.tagIds, tag.id]
                              : state.tagIds.filter((id) => id !== tag.id),
                          )
                        }
                      />
                      {tag.nameEn}
                      {tag.nameBn === null ? "" : ` / ${tag.nameBn}`}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset className="flex flex-wrap gap-6 sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Storefront flags</legend>
              {(
                [
                  ["isNew", "New arrival"],
                  ["isFeatured", "Featured on home"],
                  ["isBestseller", "Best seller badge"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={state[key]}
                    onChange={(event) => set(key, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </TabsContent>

          {/* -------------------------------------------------------- variants */}
          <TabsContent value="variants" className="flex flex-col gap-6">
            <OptionPicker
              title="Sizes"
              groups={sizeGroups}
              selected={state.sizes}
              onToggle={(ref, on) => toggleOption("SIZE", ref, on)}
            />
            <OptionPicker
              title="Colours"
              groups={colourGroups}
              selected={state.colours}
              onToggle={(ref, on) => toggleOption("COLOUR", ref, on)}
            />
            {(error("sizes") ?? error("colours")) ? (
              <FieldHint tone="error">{error("sizes") ?? error("colours")}</FieldHint>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateMatrix}
                data-testid="generate-variants"
              >
                <Wand2 aria-hidden="true" />
                Generate all combinations
              </Button>
              <p className="text-xs text-muted-foreground">
                Adds a row for every selected size × colour not listed yet. Remove the ones you do
                not sell.
              </p>
            </div>
            {!canPrice ? (
              <p className="text-xs text-muted-foreground">
                You can see prices but not change them.
              </p>
            ) : null}
            {error("variants") === undefined ? null : (
              <FieldHint tone="error">{error("variants")}</FieldHint>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Combination</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Barcode</th>
                    <th className="px-3 py-2 font-medium">
                      Price (৳){" "}
                      {state.variants.length > 1 && canPrice ? (
                        <button
                          type="button"
                          className="ml-1 underline"
                          onClick={() => applyToAll("price")}
                        >
                          copy ↓
                        </button>
                      ) : null}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      Compare-at (৳){" "}
                      {state.variants.length > 1 && canPrice ? (
                        <button
                          type="button"
                          className="ml-1 underline"
                          onClick={() => applyToAll("comparePrice")}
                        >
                          copy ↓
                        </button>
                      ) : null}
                    </th>
                    <th className="px-3 py-2 font-medium">Weight (g)</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Stock</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {state.variants.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        No variants yet. Pick sizes and colours above, then generate.
                      </td>
                    </tr>
                  ) : null}
                  {state.variants.map((row, index) => {
                    const at = (field: string) => error(`variants.${index}.${field}`);
                    return (
                      <tr
                        key={row.key}
                        className="border-t border-border align-top"
                        data-testid="variant-row"
                      >
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {[row.sizeRef, row.colourRef]
                              .filter((ref) => ref !== null)
                              .map(labelOf)
                              .join(" · ") || "Single variant"}
                          </span>
                          {row.id === undefined ? (
                            <Badge variant="outline" className="ml-2">
                              new
                            </Badge>
                          ) : null}
                          {(at("sizeRef") ?? at("colourRef")) ? (
                            <FieldHint tone="error">{at("sizeRef") ?? at("colourRef")}</FieldHint>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label={`SKU, row ${index + 1}`}
                            value={row.sku}
                            placeholder={skuPreview(row)}
                            onChange={(event) =>
                              updateVariant(row.key, { sku: event.target.value.toUpperCase() })
                            }
                            aria-invalid={at("sku") !== undefined || undefined}
                            className="h-9 font-mono text-xs"
                          />
                          {at("sku") === undefined ? null : (
                            <FieldHint tone="error">{at("sku")}</FieldHint>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label={`Barcode, row ${index + 1}`}
                            value={row.barcode}
                            onChange={(event) =>
                              updateVariant(row.key, { barcode: event.target.value })
                            }
                            aria-invalid={at("barcode") !== undefined || undefined}
                            className="h-9 font-mono text-xs"
                          />
                          {at("barcode") === undefined ? null : (
                            <FieldHint tone="error">{at("barcode")}</FieldHint>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label={`Price, row ${index + 1}`}
                            inputMode="decimal"
                            value={row.price}
                            readOnly={!canPrice}
                            onChange={(event) =>
                              updateVariant(row.key, { price: event.target.value })
                            }
                            aria-invalid={at("price") !== undefined || undefined}
                            className="h-9 w-28 tabular-nums"
                          />
                          {at("price") === undefined ? null : (
                            <FieldHint tone="error">{at("price")}</FieldHint>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label={`Compare-at price, row ${index + 1}`}
                            inputMode="decimal"
                            value={row.comparePrice}
                            readOnly={!canPrice}
                            onChange={(event) =>
                              updateVariant(row.key, { comparePrice: event.target.value })
                            }
                            aria-invalid={at("comparePrice") !== undefined || undefined}
                            className="h-9 w-28 tabular-nums"
                          />
                          {at("comparePrice") === undefined ? null : (
                            <FieldHint tone="error">{at("comparePrice")}</FieldHint>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            aria-label={`Weight in grams, row ${index + 1}`}
                            inputMode="numeric"
                            value={row.weight}
                            onChange={(event) =>
                              updateVariant(row.key, {
                                weight: event.target.value.replace(/[^0-9]/g, ""),
                              })
                            }
                            className="h-9 w-20 tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Active, row ${index + 1}`}
                            checked={row.isActive}
                            onChange={(event) =>
                              updateVariant(row.key, { isActive: event.target.checked })
                            }
                          />
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-muted-foreground tabular-nums"
                          title="Read-only. Stock is managed in Phase 7."
                        >
                          {row.onHand === undefined
                            ? "—"
                            : `${row.onHand - (row.reserved ?? 0)} / ${row.onHand}`}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            aria-label={
                              row.id === undefined
                                ? `Remove row ${index + 1}`
                                : `Archive variant, row ${index + 1}`
                            }
                            title={
                              row.id === undefined ? "Remove" : "Archive (kept for order history)"
                            }
                            onClick={() => removeVariant(row.key)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave SKU empty to generate it from the pattern{" "}
              <span className="font-mono">{references.skuPattern}</span>. Removing a saved variant
              archives it; it is never deleted, so order history stays intact.
              {initial !== null && initial.archivedVariantCount > 0
                ? ` ${initial.archivedVariantCount} archived variant(s) hidden.`
                : ""}
            </p>
          </TabsContent>

          {/* ---------------------------------------------------------- images */}
          <TabsContent value="images" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
                <ImagePlus aria-hidden="true" className="size-4" />
                Upload images
                <input
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  multiple
                  className="sr-only"
                  data-testid="image-input"
                  onChange={(event) => {
                    void onFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <MockStorageBadge show={mockStorage} />
              {uploading > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Uploading{" "}
                  {uploading}…
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP or AVIF. Large photos are resized to 2400 px on the longest side
              before upload. The first image is the main image.
            </p>
            {uploadError === null ? null : (
              <FieldHint tone="error" role="alert">
                {uploadError}
              </FieldHint>
            )}
            {error("images") === undefined ? null : (
              <FieldHint tone="error">{error("images")}</FieldHint>
            )}

            <ul className="flex flex-col gap-4">
              {state.images.map((image, index) => (
                <li
                  key={image.key}
                  className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-[6rem_1fr]"
                  data-testid="image-row"
                >
                  <div className="relative aspect-[4/5] w-24 overflow-hidden rounded-md bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a just-uploaded file */}
                    <img src={image.url} alt="" className="size-full object-contain" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-2 sm:col-span-2">
                      {index === 0 ? (
                        <Badge>Main image</Badge>
                      ) : (
                        <Badge variant="muted">#{index + 1}</Badge>
                      )}
                      {image.id === undefined ? (
                        <Badge variant="outline">not saved yet</Badge>
                      ) : null}
                      <div className="ml-auto flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label="Move up"
                          onClick={() => moveImage(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label="Move down"
                          onClick={() => moveImage(index, 1)}
                          disabled={index === state.images.length - 1}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label="Remove image"
                          onClick={() =>
                            set(
                              "images",
                              state.images.filter((candidate) => candidate.key !== image.key),
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <TextField
                      label="Alt text (English)"
                      value={image.altEn}
                      onChange={(value) => updateImage(image.key, { altEn: value })}
                      error={error(`images.${index}.altEn`)}
                    />
                    <TextField
                      label="Alt text (Bengali)"
                      lang="bn"
                      value={image.altBn}
                      onChange={(value) => updateImage(image.key, { altBn: value })}
                    />
                    <div className="sm:col-span-2">
                      <Label htmlFor={`colour-${image.key}`}>Shown for colour</Label>
                      <Select
                        id={`colour-${image.key}`}
                        value={image.colourRef ?? ""}
                        onChange={(event) =>
                          updateImage(image.key, {
                            colourRef: event.target.value === "" ? null : event.target.value,
                          })
                        }
                      >
                        <option value="">Every colour</option>
                        {colourChoices.map((choice) => (
                          <option key={choice.ref} value={choice.ref}>
                            {choice.label}
                          </option>
                        ))}
                      </Select>
                      {(error(`images.${index}.colourRef`) ?? error(`images.${index}`)) ? (
                        <FieldHint tone="error">
                          {error(`images.${index}.colourRef`) ?? error(`images.${index}`)}
                        </FieldHint>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>

          {/* ------------------------------------------------------------- seo */}
          <TabsContent value="seo" className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="SEO title (English)"
              maxLength={70}
              hint={`${state.seoTitleEn.length}/70 — empty uses the name`}
              value={state.seoTitleEn}
              onChange={(value) => set("seoTitleEn", value)}
              error={error("seoTitleEn")}
            />
            <TextField
              label="SEO title (Bengali)"
              lang="bn"
              maxLength={70}
              hint={`${state.seoTitleBn.length}/70`}
              value={state.seoTitleBn}
              onChange={(value) => set("seoTitleBn", value)}
              error={error("seoTitleBn")}
            />
            <TextAreaField
              label="Meta description (English)"
              maxLength={170}
              hint={`${state.seoDescriptionEn.length}/170 — empty uses the summary`}
              value={state.seoDescriptionEn}
              onChange={(value) => set("seoDescriptionEn", value)}
              rows={3}
              error={error("seoDescriptionEn")}
            />
            <TextAreaField
              label="Meta description (Bengali)"
              lang="bn"
              maxLength={170}
              hint={`${state.seoDescriptionBn.length}/170`}
              value={state.seoDescriptionBn}
              onChange={(value) => set("seoDescriptionBn", value)}
              rows={3}
              error={error("seoDescriptionBn")}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ------------------------------------------------------------- sidebar */}
      <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-lg border border-border bg-background p-4">
          <Button
            type="button"
            full
            onClick={save}
            disabled={pending || uploading > 0}
            data-testid="save-product"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            {initial === null ? "Create draft" : "Save changes"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {dirty ? "Unsaved changes." : "No unsaved changes."} Product, variants and images are
            saved together.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Ready to publish?
          </h2>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-success">All requirements met.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm" data-testid="publish-missing">
              {missing.map((requirement) => (
                <li
                  key={requirement}
                  className={cn("flex gap-2", requirement === "price" && "text-amber-700")}
                >
                  <span aria-hidden="true">✗</span>
                  {PUBLISH_REQUIREMENT_LABELS[requirement]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Dot() {
  return <span aria-label="has errors" className="size-1.5 rounded-full bg-destructive" />;
}

function groupChoices(choices: OptionChoice[]): Array<[string, OptionChoice[]]> {
  const groups = new Map<string, OptionChoice[]>();
  for (const choice of choices)
    groups.set(choice.group, [...(groups.get(choice.group) ?? []), choice]);
  return [...groups.entries()];
}

function OptionPicker({
  title,
  groups,
  selected,
  onToggle,
}: {
  title: string;
  groups: Array<[string, OptionChoice[]]>;
  selected: readonly string[];
  onToggle: (ref: string, on: boolean) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="flex flex-col gap-3">
        {groups.map(([group, list]) => (
          <div key={group}>
            <p className="text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
              {group}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
              {list.map((choice) => (
                <label key={choice.ref} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(choice.ref)}
                    onChange={(event) => onToggle(choice.ref, event.target.checked)}
                    data-testid={`option-${choice.type.toLowerCase()}-${choice.code}`}
                  />
                  {choice.hex === null ? null : (
                    <span
                      aria-hidden="true"
                      className="size-3.5 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: choice.hex }}
                    />
                  )}
                  {choice.label}
                </label>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No options available. Add presets under Catalogue → Options.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
