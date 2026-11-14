/**
 * Input validation for every catalogue write. Dependency-free (Zod only), so
 * the admin forms can import the same limits for client-side hints; the server
 * always re-validates.
 */
import { z } from "zod";

import { parseTakaInput } from "@/lib/money";
import { isValidSlug, SLUG_MAX_LENGTH } from "./slug";
import { isValidBarcode, isValidCategoryCode, isValidOptionCode, isValidSku } from "./sku";

const id = z.string().min(1).max(64);
const NFC = (value: string) => value.normalize("NFC").trim();

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform(NFC)
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`));

/** Empty strings become null, so "cleared" and "never set" are the same. */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value === undefined || value === null ? "" : NFC(value);
      return trimmed === "" ? null : trimmed;
    })
    .pipe(z.string().max(max, `Must be at most ${max} characters.`).nullable());

export const slugField = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine(isValidSlug, {
    message: `Use lower-case English letters, digits and single hyphens (max ${SLUG_MAX_LENGTH}).`,
  });

const priceField = (label: string) =>
  z.string().transform((value, context) => {
    const parsed = parseTakaInput(value);
    if (parsed === null) {
      context.addIssue({
        code: "custom",
        message: `${label}: enter an amount like 1250 or 1250.50.`,
      });
      return z.NEVER;
    }
    return parsed;
  });

const optionalPriceField = (label: string) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((value, context) => {
      if (value === undefined || value === null || value.trim() === "") return null;
      const parsed = parseTakaInput(value);
      if (parsed === null) {
        context.addIssue({
          code: "custom",
          message: `${label}: enter an amount like 1250 or 1250.50.`,
        });
        return z.NEVER;
      }
      return parsed;
    });

// ---------------------------------------------------------------------------
// product
// ---------------------------------------------------------------------------

/** Copy fields: the only ones a Content Editor may change. */
export const productContentFields = {
  nameEn: requiredText(160, "English name"),
  nameBn: optionalText(160),
  summaryEn: optionalText(300),
  summaryBn: optionalText(300),
  /** Paragraphs separated by a blank line. */
  descriptionEn: optionalText(8000),
  descriptionBn: optionalText(8000),
  fabricEn: optionalText(200),
  fabricBn: optionalText(200),
  /** One care instruction per line. */
  careEn: optionalText(2000),
  careBn: optionalText(2000),
  seoTitleEn: optionalText(70),
  seoTitleBn: optionalText(70),
  seoDescriptionEn: optionalText(170),
  seoDescriptionBn: optionalText(170),
};

const imageAltSchema = z.object({
  id,
  altEn: optionalText(200),
  altBn: optionalText(200),
});

/** Content Editor save: copy and image alt text, nothing structural. */
export const productContentSchema = z.object({
  id,
  version: z.number().int().min(0),
  ...productContentFields,
  images: z.array(imageAltSchema).max(30).default([]),
});

/** Content Editor draft: copy plus the (required) primary category. */
export const productDraftSchema = z.object({
  ...productContentFields,
  slug: slugField,
  categoryId: id,
});

export const uploadedImageSchema = z.object({
  provider: z.enum(["cloudinary", "local-mock"]),
  key: z.string().min(1).max(200),
  url: z.string().min(1).max(500),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().positive(),
  format: z.string().min(1).max(10),
  token: z.string().min(10).max(200),
});

export const productImageInputSchema = z
  .object({
    /** Existing image id, or absent for a new upload. */
    id: id.optional(),
    upload: uploadedImageSchema.optional(),
    altEn: optionalText(200),
    altBn: optionalText(200),
    /** Option value ref of a colour; the image then shows for that colour. */
    colourRef: z.string().max(80).nullable().optional(),
  })
  .refine((image) => (image.id === undefined) !== (image.upload === undefined), {
    message: "An image is either existing or a new upload.",
  });

/**
 * One selected option value. `ref` is an existing OptionValue id of this
 * product, or "preset:<OptionPreset id>" for a value taken from the library.
 */
export const optionValueInputSchema = z.object({
  ref: z.string().min(1).max(80),
});

export const variantInputSchema = z
  .object({
    id: id.optional(),
    sizeRef: z.string().max(80).nullable().optional(),
    colourRef: z.string().max(80).nullable().optional(),
    /** Blank: generated from the SKU pattern on save. */
    sku: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => value === "" || isValidSku(value), {
        message: "SKU: capital English letters, digits and hyphens only.",
      }),
    barcode: z
      .string()
      .optional()
      .nullable()
      .transform((value) => {
        const trimmed = (value ?? "").trim().toUpperCase();
        return trimmed === "" ? null : trimmed;
      })
      .refine((value) => value === null || isValidBarcode(value), {
        message: "Barcode: 4–64 letters, digits or hyphens.",
      }),
    price: priceField("Price"),
    comparePrice: optionalPriceField("Compare-at price"),
    weightGrams: z.number().int().min(0).max(100_000).nullable().optional(),
    isActive: z.boolean(),
  })
  .superRefine((variant, context) => {
    if (variant.comparePrice !== null && variant.comparePrice <= variant.price) {
      context.addIssue({
        code: "custom",
        path: ["comparePrice"],
        message: "Compare-at price must be higher than the price.",
      });
    }
  });

export const productSaveSchema = z.object({
  /** Absent for a new product. */
  id: id.optional(),
  version: z.number().int().min(0).optional(),
  ...productContentFields,
  slug: slugField,
  categoryId: id,
  extraCategoryIds: z.array(id).max(10).default([]),
  brandId: id.nullable().optional(),
  sizeChartId: id.nullable().optional(),
  fit: z.string().max(30).nullable().optional(),
  tagIds: z.array(id).max(30).default([]),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isBestseller: z.boolean().default(false),
  sizes: z.array(optionValueInputSchema).max(40).default([]),
  colours: z.array(optionValueInputSchema).max(40).default([]),
  variants: z.array(variantInputSchema).max(300).default([]),
  images: z.array(productImageInputSchema).max(30).default([]),
});

export type ProductSaveInput = z.infer<typeof productSaveSchema>;
export type ProductContentInput = z.infer<typeof productContentSchema>;
export type ProductDraftInput = z.infer<typeof productDraftSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductImageInput = z.infer<typeof productImageInputSchema>;

export const productStatusChangeSchema = z.object({
  productIds: z.array(id).min(1).max(100),
  status: z.enum(["PUBLISHED", "ARCHIVED", "DRAFT"]),
});

export const productListQuerySchema = z.object({
  q: z.string().max(80).optional().catch(undefined),
  categoryId: id.optional().catch(undefined),
  brandId: id.optional().catch(undefined),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional().catch(undefined),
  sort: z.enum(["updated", "name", "created", "status"]).default("updated").catch("updated"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ---------------------------------------------------------------------------
// categories, brands, presets, tags, size charts
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  id: id.optional(),
  slug: slugField,
  code: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = (value ?? "").trim().toUpperCase();
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === null || isValidCategoryCode(value), {
      message: "Code: 2–4 capital English letters, e.g. SH.",
    }),
  nameEn: requiredText(120, "English name"),
  nameBn: optionalText(120),
  taglineEn: optionalText(160),
  taglineBn: optionalText(160),
  descriptionEn: optionalText(2000),
  descriptionBn: optionalText(2000),
  seoTitleEn: optionalText(70),
  seoTitleBn: optionalText(70),
  seoDescriptionEn: optionalText(170),
  seoDescriptionBn: optionalText(170),
  parentId: id.nullable().optional(),
  sizeChartId: id.nullable().optional(),
  /** A new upload replaces the image; `removeImage` clears it. */
  imageUpload: uploadedImageSchema.optional(),
  removeImage: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  id: id.optional(),
  slug: slugField,
  nameEn: requiredText(120, "English name"),
  nameBn: optionalText(120),
  descriptionEn: optionalText(2000),
  descriptionBn: optionalText(2000),
  logoUpload: uploadedImageSchema.optional(),
  removeLogo: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type BrandInput = z.infer<typeof brandSchema>;

export const optionPresetSchema = z.object({
  id: id.optional(),
  type: z.enum(["SIZE", "COLOUR"]),
  group: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,20}$/, "Group: lower-case letters, digits and hyphens."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidOptionCode, { message: "Code: 1–6 capital letters or digits, e.g. NVY." }),
  valueEn: requiredText(40, "English value"),
  valueBn: optionalText(40),
  hex: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed.toUpperCase();
    })
    .refine((value) => value === null || /^#[0-9A-F]{6}$/.test(value), {
      message: "Swatch: a hex colour like #1F2A44.",
    }),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});

export type OptionPresetInput = z.infer<typeof optionPresetSchema>;

export const tagSchema = z.object({
  id: id.optional(),
  slug: slugField,
  nameEn: requiredText(60, "English name"),
  nameBn: optionalText(60),
  /** Comma- or newline-separated alternative spellings. */
  aliases: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(/[,\n]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(40)).max(20)),
});

export type TagInput = z.infer<typeof tagSchema>;

const sizeChartCell = z.string().trim().max(20);

export const sizeChartSchema = z
  .object({
    id: id.optional(),
    nameEn: requiredText(120, "English name"),
    nameBn: optionalText(120),
    noteEn: optionalText(500),
    noteBn: optionalText(500),
    unit: z.enum(["INCH", "CM"]),
    /** Measurement columns (the first, "Size", is implicit). */
    columns: z
      .array(z.object({ en: requiredText(30, "Column name"), bn: optionalText(30) }))
      .min(1)
      .max(10),
    rows: z
      .array(z.object({ size: requiredText(12, "Size"), values: z.array(sizeChartCell) }))
      .min(1)
      .max(30),
  })
  .superRefine((chart, context) => {
    chart.rows.forEach((row, index) => {
      if (row.values.length !== chart.columns.length) {
        context.addIssue({
          code: "custom",
          path: ["rows", index, "values"],
          message: `Row ${row.size} needs ${chart.columns.length} values.`,
        });
      }
    });
  });

export type SizeChartInput = z.infer<typeof sizeChartSchema>;

/** Zod issues as { "variants.0.sku": "message" } for field-level display. */
export function fieldErrorsFrom(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".") || "_form";
    errors[path] ??= issue.message;
  }
  return errors;
}
