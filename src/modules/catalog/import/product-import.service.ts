import "server-only";

import { createHash } from "node:crypto";

import { readSheet } from "read-excel-file/node";

import { AppError } from "@/lib/errors";
import {
  hasAnyPermission,
  hasPermission,
  assertPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { isValidEan13 } from "@/modules/labels/barcode";
import { csvField, csvLine, CSV_BOM } from "@/modules/reports/report-csv";
import { getCatalogSettings, getImportSettings } from "@/modules/settings/settings.service";
import type {
  PlannedOptionValue,
  PlannedVariant,
  ProductGraphPlan,
  ProductScalars,
} from "../catalog.repository";
import { uniqueViolationTarget, writeProductGraph, type CatalogTx } from "../catalog.repository";
import { missingForPublish } from "../publish-rules";
import { tagSearchText } from "../search-text";
import { isValidBarcode, isValidSku, toSkuSegment } from "../sku";
import { slugify } from "../slug";
import {
  countImportOutcomes,
  createImportRecord,
  ensureTagsAndPresets,
  findDoneImportWithHash,
  findImport,
  findImportReferences,
  findImportRows,
  findPendingImportRows,
  findPresetsForImport,
  findProductForImport,
  findProductsByCodes,
  findProductsByIds,
  findSlugsStartingWith,
  findTakenBarcodesFor,
  findUserNames,
  findVariantOwnersBySkus,
  inImportTransaction,
  listImports,
  markImportRow,
  updateImportStatus,
  type ImportProductGraph,
  type ImportReferences,
  type ImportRowWrite,
  type NewPreset,
  type NewTag,
} from "./product-import.repository";
import {
  EXAMPLE_PREFIX,
  groupProducts,
  hasHtml,
  IMPORT_COLUMNS,
  isClear,
  parseMoneyCell,
  parseWholeNumber,
  readProductSheet,
  splitList,
  tableFromCsv,
  type ImportIssue,
  type ProductGroup,
} from "./product-sheet";

/**
 * Product import (Phase 12): a file is checked first — nothing is written to
 * the catalogue — and the plan stored. Applying reads the stored plan:
 *
 *   - all or nothing (default): every product in one transaction, only when
 *     the check found no error, up to `catalog.import.atomicMaxRows` rows;
 *   - good products only (when allowed): one transaction per product, in
 *     chunks the browser asks for one after another.
 *
 * Products are never deleted and variants never removed or deactivated. A
 * product edited after the check is skipped (optimistic lock on `version`).
 */

const VALID_FOR_MS = 24 * 60 * 60 * 1000;
const CHUNK_PRODUCTS = 25;
const CHUNK_MS = 8000;
const MAX_WEIGHT_G = 100_000;

// ---------------------------------------------------------------------------
// payload: what the check decided, applied later
// ---------------------------------------------------------------------------

type OptionChoice =
  | { kind: "existing"; valueId: string }
  | { kind: "preset"; presetId: string }
  | { kind: "new"; type: "SIZE" | "COLOUR"; code: string; valueEn: string };

interface VariantPayload {
  id?: string;
  /** Existing: the current SKU. New: typed, or "" to build from the pattern. */
  sku: string;
  size?: OptionChoice | null;
  colour?: OptionChoice | null;
  /** New: typed or null (the shop's own is made). Existing: only when changed. */
  barcode?: string | null;
  pricePoisha?: number;
  comparePricePoisha?: number | null;
  weightGrams?: number | null;
  costPoisha?: number;
}

type ScalarChanges = Partial<
  Pick<
    ProductScalars,
    | "nameEn"
    | "nameBn"
    | "descriptionEn"
    | "descriptionBn"
    | "fabricEn"
    | "fabricBn"
    | "careEn"
    | "careBn"
    | "categoryId"
    | "brandId"
    | "sizeChartId"
    | "fit"
    | "seoTitleEn"
    | "seoTitleBn"
    | "seoDescriptionEn"
    | "seoDescriptionBn"
  >
>;

interface ImportPayload {
  productId: string | null;
  categoryCode: string | null;
  scalars: ScalarChanges;
  extraCategoryIds?: string[];
  /** Existing tag ids plus slugs of tags this import creates. */
  tagIds?: string[];
  newTags: NewTag[];
  newPresets: NewPreset[];
  status?: "DRAFT" | "PUBLISHED";
  variants: VariantPayload[];
}

interface DiffEntry {
  field: string;
  sku: string | null;
  before: string;
  after: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function paragraphs(value: string): string[] | null {
  const parts = value
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return parts.length === 0 ? null : parts;
}

function lines(value: string): string[] | null {
  const parts = value
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 0 ? null : parts;
}

function jsonList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((item): item is string => typeof item === "string");
  return list.length === 0 ? null : list;
}

function listText(value: string[] | null, separator: string): string {
  return value === null ? "" : value.join(separator);
}

function takaText(poisha: number | null | undefined): string {
  if (poisha === null || poisha === undefined) return "";
  return `${Math.floor(poisha / 100)}${poisha % 100 === 0 ? "" : `.${String(poisha % 100).padStart(2, "0")}`}`;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Spreadsheet values as text: numbers exactly as stored, dates as YYYY-MM-DD. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/** Undoes the export's guard against spreadsheet formulas ("'-5" → "-5"). */
function unguard(table: string[][]): string[][] {
  return table.map((cells) => cells.map((cell) => (/^'[=+\-@]/.test(cell) ? cell.slice(1) : cell)));
}

function forbidden(message: string) {
  return new AppError("FORBIDDEN", message, { messageKey: "errors.forbidden" });
}

// ---------------------------------------------------------------------------
// reading the file
// ---------------------------------------------------------------------------

interface FileInput {
  fileName: string;
  bytes: Uint8Array;
}

async function readTable(
  file: FileInput,
): Promise<{ kind: "csv" | "xlsx"; table: string[][]; rowNumbers: number[] } | { error: string }> {
  const isZip = file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
  const lower = file.fileName.toLowerCase();
  if (lower.endsWith(".xls")) {
    return { error: "পুরনো .xls ফাইল চলবে না। Excel-এ .xlsx বা CSV UTF-8 হিসেবে Save As করুন।" };
  }
  if (isZip || lower.endsWith(".xlsx")) {
    try {
      const data = await readSheet(Buffer.from(file.bytes), 1, {
        parseNumber: (text: string) => text,
        trim: false,
      });
      const table = data.map((row) => row.map(cellText));
      return { kind: "xlsx", table, rowNumbers: table.map((_, index) => index + 1) };
    } catch {
      return { error: "Excel ফাইলটা পড়া গেল না। প্রথম sheet-এ শিরোনাম আর সারি আছে কি না দেখুন।" };
    }
  }
  const text = decodeUtf8(file.bytes);
  if (text === null) {
    return {
      error:
        'ফাইলটা UTF-8 নয়। Excel-এ File → Save As → ধরন: "CSV UTF-8 (Comma delimited)" → Save।',
    };
  }
  return { kind: "csv", ...tableFromCsv(text) };
}

// ---------------------------------------------------------------------------
// resolving names and codes
// ---------------------------------------------------------------------------

interface Context {
  actor: StaffContext;
  refs: ImportReferences;
  fits: Array<{ key: string; en: string; bn?: string | undefined }>;
  includeCost: boolean;
  createMissingOptions: boolean;
  productsByCode: Map<string, ImportProductGraph>;
  productsById: Map<string, ImportProductGraph>;
  skuOwners: Map<string, { code: string | null; productId: string }>;
  /** SKUs typed by new variants anywhere in the file (lower-cased → product key). */
  fileSkus: Map<string, string>;
  fileBarcodes: Map<string, string>;
  plannedSlugs: Set<string>;
}

function findCategory(context: Context, code: string) {
  return context.refs.categories.find(
    (category) => category.code !== null && same(category.code, code),
  );
}

function findOptionChoice(
  context: Context,
  graph: ImportProductGraph | null,
  type: "SIZE" | "COLOUR",
  raw: string,
): { choice: OptionChoice; code: string; valueEn: string; valueBn: string | null } | null {
  const value = raw.trim();
  for (const option of graph?.options ?? []) {
    if (option.type !== type) continue;
    const found = option.values.find(
      (candidate) =>
        (candidate.code !== null && same(candidate.code, value)) ||
        same(candidate.valueEn, value) ||
        (candidate.valueBn !== null && same(candidate.valueBn, value)),
    );
    if (found !== undefined) {
      return {
        choice: { kind: "existing", valueId: found.id },
        code: found.code ?? toSkuSegment(found.valueEn).slice(0, type === "COLOUR" ? 3 : 6),
        valueEn: found.valueEn,
        valueBn: found.valueBn,
      };
    }
  }
  const preset = context.refs.presets.find(
    (candidate) =>
      candidate.type === type &&
      (same(candidate.code, value) ||
        same(candidate.valueEn, value) ||
        (candidate.valueBn !== null && same(candidate.valueBn, value))),
  );
  if (preset === undefined) return null;
  return {
    choice: { kind: "preset", presetId: preset.id },
    code: preset.code,
    valueEn: preset.valueEn,
    valueBn: preset.valueBn,
  };
}

// ---------------------------------------------------------------------------
// planning one product
// ---------------------------------------------------------------------------

interface PlannedRow {
  write: ImportRowWrite;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

const CONTENT_COLUMNS: Record<string, keyof ScalarChanges> = {
  name_en: "nameEn",
  name_bn: "nameBn",
  description_en: "descriptionEn",
  description_bn: "descriptionBn",
  fabric_en: "fabricEn",
  fabric_bn: "fabricBn",
  care_en: "careEn",
  care_bn: "careBn",
  seo_title_en: "seoTitleEn",
  seo_title_bn: "seoTitleBn",
  seo_description_en: "seoDescriptionEn",
  seo_description_bn: "seoDescriptionBn",
};

function currentText(graph: ImportProductGraph, field: keyof ScalarChanges): string {
  const value = graph[field as keyof ImportProductGraph];
  if (field === "descriptionEn" || field === "descriptionBn")
    return listText(jsonList(value), "\n\n");
  if (field === "careEn" || field === "careBn") return listText(jsonList(value), "\n");
  return typeof value === "string" ? value : "";
}

function planProduct(context: Context, group: ProductGroup, position: number): PlannedRow {
  const { actor } = context;
  const errors: ImportIssue[] = [...group.errors];
  const warnings: ImportIssue[] = [];
  const firstRow = group.rows[0]?.row ?? null;
  const error = (column: string | null, message: string, row: number | null = firstRow) =>
    errors.push({ row, column, message });
  const warn = (column: string | null, message: string, row: number | null = firstRow) =>
    warnings.push({ row, column, message });

  const graph =
    group.code === null
      ? null
      : group.code.startsWith("#")
        ? (context.productsById.get(group.code.slice(1)) ?? null)
        : (context.productsByCode.get(group.code) ?? null);
  const isNew = graph === null;
  const cells = group.product;
  const canWrite = hasPermission(actor, "catalog.write");
  const canCopy = hasAnyPermission(actor, ["catalog.write", "catalog.content"]);
  const canPrice = hasPermission(actor, "catalog.price.write");
  const canPublish = hasPermission(actor, "catalog.publish");

  if (group.code !== null && graph === null) {
    if (group.code.startsWith(EXAMPLE_PREFIX)) {
      error("product_code", "এটা টেমপ্লেটের উদাহরণ — উদাহরণের সারিগুলো মুছে দিন।");
    } else if ((group.rows[0]?.cells.product_code ?? "") !== "") {
      error(
        "product_code",
        `product_code ${group.code} পাওয়া যায়নি। নতুন প্রোডাক্টে ঘরটা ফাঁকা রাখুন।`,
      );
    }
  }
  if (isNew && !canWrite) error(null, "নতুন প্রোডাক্ট তৈরির অনুমতি (catalog.write) নেই।");

  const diff: DiffEntry[] = [];
  const scalars: ScalarChanges = {};
  const payload: ImportPayload = {
    productId: graph?.id ?? null,
    categoryCode: null,
    scalars,
    newTags: [],
    newPresets: [],
    variants: [],
  };

  // --- product-level text ------------------------------------------------
  for (const column of IMPORT_COLUMNS) {
    const field = CONTENT_COLUMNS[column.key];
    if (field === undefined) continue;
    const raw = cells[column.key];
    if (raw === undefined) continue;
    const clearing = isClear(raw);
    if (clearing && (isNew || !column.clearable)) {
      error(column.key, `${column.key}: [clear] এখানে চলবে না।`);
      continue;
    }
    const text = clearing ? "" : raw;
    if (column.maxLength !== undefined && text.length > column.maxLength) {
      error(column.key, `${column.key}: ${column.maxLength} অক্ষরের বেশি।`);
      continue;
    }
    if (hasHtml(text)) {
      error(column.key, `${column.key}: HTML ট্যাগ চলবে না — সাধারণ লেখা দিন।`);
      continue;
    }
    const value =
      field === "descriptionEn" || field === "descriptionBn"
        ? paragraphs(text)
        : field === "careEn" || field === "careBn"
          ? lines(text)
          : text === ""
            ? null
            : text;
    const before = graph === null ? "" : currentText(graph, field);
    const after =
      value === null
        ? ""
        : Array.isArray(value)
          ? value.join(field.startsWith("care") ? "\n" : "\n\n")
          : value;
    if (graph !== null && before === after) continue;
    if (!canCopy) {
      error(column.key, `${column.key} বদলানোর অনুমতি নেই।`);
      continue;
    }
    (scalars as Record<string, unknown>)[field] = value;
    if (!isNew) diff.push({ field: column.key, sku: null, before, after });
  }
  if (isNew && (cells.name_en ?? "") === "") error("name_en", "নতুন প্রোডাক্টে name_en লাগবে।");

  // --- category, brand, size chart, fit, tags -----------------------------
  const structural = (column: string, before: string, after: string, apply: () => void) => {
    if (before === after) return;
    if (!canWrite) {
      error(column, `${column} বদলানোর অনুমতি (catalog.write) নেই।`);
      return;
    }
    apply();
    if (!isNew) diff.push({ field: column, sku: null, before, after });
  };

  const categoryCell = cells.category_code;
  if (categoryCell !== undefined && categoryCell !== "") {
    const category = findCategory(context, categoryCell);
    if (category === undefined)
      error("category_code", `ক্যাটাগরি কোড "${categoryCell}" পাওয়া যায়নি।`);
    else {
      structural("category_code", graph?.category.code ?? "", category.code ?? "", () => {
        scalars.categoryId = category.id;
      });
      if (isNew) payload.categoryCode = category.code;
    }
  } else if (isNew) error("category_code", "নতুন প্রোডাক্টে category_code লাগবে।");

  const extraCell = cells.extra_category_codes;
  if (extraCell !== undefined) {
    const codes = isClear(extraCell) ? [] : splitList(extraCell);
    const ids: string[] = [];
    for (const code of codes) {
      const category = findCategory(context, code);
      if (category === undefined)
        error("extra_category_codes", `ক্যাটাগরি কোড "${code}" পাওয়া যায়নি।`);
      else if (category.id !== (scalars.categoryId ?? graph?.categoryId)) ids.push(category.id);
    }
    const beforeCodes = (graph?.extraCategories ?? []).map((row) => row.category.code ?? "").sort();
    const afterCodes = ids
      .map((id) => context.refs.categories.find((c) => c.id === id)?.code ?? "")
      .sort();
    structural("extra_category_codes", beforeCodes.join(";"), afterCodes.join(";"), () => {
      payload.extraCategoryIds = ids;
    });
  }

  const brandCell = cells.brand;
  if (brandCell !== undefined) {
    if (isClear(brandCell)) {
      structural("brand", graph?.brand?.nameEn ?? "", "", () => {
        scalars.brandId = null;
      });
    } else {
      const brand = context.refs.brands.find(
        (row) => same(row.nameEn, brandCell) || same(row.slug, brandCell),
      );
      if (brand === undefined)
        error("brand", `ব্র্যান্ড "${brandCell}" পাওয়া যায়নি (নতুন ব্র্যান্ড তৈরি হয় না)।`);
      else
        structural("brand", graph?.brand?.nameEn ?? "", brand.nameEn, () => {
          scalars.brandId = brand.id;
        });
    }
  }

  const chartCell = cells.size_chart;
  if (chartCell !== undefined) {
    if (isClear(chartCell)) {
      structural("size_chart", graph?.sizeChart?.nameEn ?? "", "", () => {
        scalars.sizeChartId = null;
      });
    } else {
      const chart = context.refs.sizeCharts.find((row) => same(row.nameEn, chartCell));
      if (chart === undefined) error("size_chart", `সাইজ চার্ট "${chartCell}" পাওয়া যায়নি।`);
      else
        structural("size_chart", graph?.sizeChart?.nameEn ?? "", chart.nameEn, () => {
          scalars.sizeChartId = chart.id;
        });
    }
  }

  const fitCell = cells.fit;
  if (fitCell !== undefined) {
    if (isClear(fitCell)) {
      structural("fit", graph?.fit ?? "", "", () => {
        scalars.fit = null;
      });
    } else {
      const fit = context.fits.find(
        (row) =>
          same(row.key, fitCell) ||
          same(row.en, fitCell) ||
          (row.bn !== undefined && same(row.bn, fitCell)),
      );
      if (fit === undefined) error("fit", `ফিট "${fitCell}" তালিকায় নেই।`);
      else
        structural("fit", graph?.fit ?? "", fit.key, () => {
          scalars.fit = fit.key;
        });
    }
  }

  const tagCell = cells.tags;
  if (tagCell !== undefined) {
    const names = isClear(tagCell) ? [] : splitList(tagCell);
    const ids: string[] = [];
    const newTags: NewTag[] = [];
    for (const name of names) {
      const tag = context.refs.tags.find((row) => same(row.nameEn, name) || same(row.slug, name));
      if (tag !== undefined) ids.push(tag.id);
      else {
        const slug = slugify(name);
        if (slug === "") {
          error("tags", `ট্যাগ "${name}" থেকে slug তৈরি হলো না।`);
          continue;
        }
        newTags.push({
          slug,
          nameEn: name,
          searchText: tagSearchText({ nameEn: name, nameBn: null, aliases: [] }),
        });
        ids.push(`new:${slug}`);
        warn("tags", `নতুন ট্যাগ তৈরি হবে: "${name}"`);
      }
    }
    const beforeNames = (graph?.tags ?? []).map((row) => row.tag.nameEn.toLowerCase()).sort();
    const afterNames = names.map((name) => {
      const tag = context.refs.tags.find((row) => same(row.nameEn, name) || same(row.slug, name));
      return (tag?.nameEn ?? name).toLowerCase();
    });
    structural("tags", beforeNames.join(";"), [...new Set(afterNames)].sort().join(";"), () => {
      payload.tagIds = [...new Set(ids)];
      payload.newTags = newTags;
    });
  }

  // --- variants -----------------------------------------------------------
  const existingVariants = graph?.variants ?? [];
  const usesSize = (graph?.options ?? []).some(
    (option) => option.type === "SIZE" && option.values.length > 0,
  );
  const usesColour = (graph?.options ?? []).some(
    (option) => option.type === "COLOUR" && option.values.length > 0,
  );
  const combos = new Set<string>();
  const newPresetKeys = new Set<string>();
  const optionOf = (variant: (typeof existingVariants)[number], type: "SIZE" | "COLOUR") => {
    const ids = new Set(variant.optionValues.map((link) => link.optionValueId));
    for (const option of graph?.options ?? []) {
      if (option.type !== type) continue;
      const value = option.values.find((candidate) => ids.has(candidate.id));
      if (value !== undefined) return value;
    }
    return null;
  };
  let effectivePrices = 0;

  for (const row of group.rows) {
    const at = (column: string | null, message: string) => error(column, message, row.row);
    const cell = (column: string) => row.cells[column] ?? "";
    const sku = cell("sku").toUpperCase();
    if (sku.startsWith(EXAMPLE_PREFIX)) {
      at("sku", "এটা টেমপ্লেটের উদাহরণ — উদাহরণের সারিগুলো মুছে দিন।");
      continue;
    }

    // which option values the row names
    const resolveOption = (type: "SIZE" | "COLOUR", column: "size" | "colour") => {
      const raw = cell(column);
      if (raw === "") return null;
      const found = findOptionChoice(context, graph, type, raw);
      if (found !== null) return found;
      if (!context.createMissingOptions) {
        at(column, `${column === "size" ? "সাইজ" : "রঙ"} "${raw}" কোনো preset-এর সাথে মেলেনি।`);
        return undefined;
      }
      const code = toSkuSegment(raw).slice(0, type === "COLOUR" ? 3 : 6);
      if (code === "") {
        at(column, `"${raw}" থেকে কোড তৈরি হলো না।`);
        return undefined;
      }
      if (!newPresetKeys.has(`${type}:${code}`)) {
        newPresetKeys.add(`${type}:${code}`);
        payload.newPresets.push({ type, code, valueEn: raw });
        warn(column, `নতুন preset তৈরি হবে: ${column === "size" ? "সাইজ" : "রঙ"} ${code}`, row.row);
      }
      return {
        choice: { kind: "new", type, code, valueEn: raw } as OptionChoice,
        code,
        valueEn: raw,
        valueBn: null,
      };
    };
    const size = resolveOption("SIZE", "size");
    const colour = resolveOption("COLOUR", "colour");
    if (size === undefined || colour === undefined) continue;

    // the existing variant this row describes: by SKU, else by size and colour
    let current: (typeof existingVariants)[number] | undefined;
    if (sku !== "") {
      current = existingVariants.find((variant) => same(variant.sku, sku));
      const owner = context.skuOwners.get(sku.toLowerCase());
      if (current === undefined && owner !== undefined && owner.productId !== graph?.id) {
        at("sku", `SKU ${sku} অন্য প্রোডাক্টের (${owner.code ?? "কোডহীন"})।`);
        continue;
      }
    }
    if (current === undefined && (size !== null || colour !== null)) {
      current = existingVariants.find((variant) => {
        const s = optionOf(variant, "SIZE");
        const c = optionOf(variant, "COLOUR");
        return (
          (size === null ? s === null : s !== null && same(s.valueEn, size.valueEn)) &&
          (colour === null ? c === null : c !== null && same(c.valueEn, colour.valueEn))
        );
      });
      if (current !== undefined && sku !== "" && !same(current.sku, sku)) {
        at("sku", `এই সাইজ/রঙের SKU ${current.sku}; SKU বদলানো যায় না।`);
        continue;
      }
    }
    if (
      current === undefined &&
      existingVariants.length === 1 &&
      !usesSize &&
      !usesColour &&
      size === null &&
      colour === null
    ) {
      current = existingVariants[0];
    }

    const comboKey =
      current?.id ??
      `${size?.valueEn.toLowerCase() ?? "-"}|${colour?.valueEn.toLowerCase() ?? "-"}`;
    if (combos.has(comboKey)) {
      at("size", "একই সাইজ ও রঙ এই প্রোডাক্টে দুবার আছে।");
      continue;
    }
    combos.add(comboKey);

    const label =
      current?.sku ?? (sku || [size?.code, colour?.code].filter(Boolean).join("-") || "নতুন");
    const variant: VariantPayload = { sku: current?.sku ?? sku };
    let changed = false;
    const change = (field: string, before: string, after: string) => {
      changed = true;
      if (current !== undefined) diff.push({ field, sku: label, before, after });
    };

    if (current === undefined) {
      if (!canWrite) {
        at(null, "নতুন ভ্যারিয়েন্ট যোগের অনুমতি (catalog.write) নেই।");
        continue;
      }
      if (usesSize && size === null) at("size", "এই প্রোডাক্টের ভ্যারিয়েন্টে সাইজ লাগবে।");
      if (usesColour && colour === null) at("colour", "এই প্রোডাক্টের ভ্যারিয়েন্টে রঙ লাগবে।");
      if (
        !isNew &&
        !usesSize &&
        !usesColour &&
        existingVariants.length > 0 &&
        (size !== null || colour !== null)
      ) {
        at("size", "এই প্রোডাক্টের সাইজ/রঙ নেই — নতুন অপশন যোগ করতে এডিট পেজ ব্যবহার করুন।");
      }
      if (sku !== "") {
        if (!isValidSku(sku)) at("sku", `SKU "${sku}" ঠিক নয় (বড় অক্ষর, অঙ্ক আর - চলে)।`);
        const other = context.fileSkus.get(sku.toLowerCase());
        if (
          context.skuOwners.has(sku.toLowerCase()) ||
          (other !== undefined && other !== group.key)
        ) {
          at("sku", `SKU ${sku} আগে থেকেই আছে।`);
        }
        context.fileSkus.set(sku.toLowerCase(), group.key);
      }
      if (sku === "" && graph !== null && graph.code === null) {
        at("sku", "এই পুরনো প্রোডাক্টের কোড নেই — নতুন ভ্যারিয়েন্টে SKU লিখুন।");
      }
      variant.size = size?.choice ?? null;
      variant.colour = colour?.choice ?? null;
      variant.barcode = null;
      changed = true;
    }

    // barcode
    const barcode = cell("barcode");
    if (barcode !== "") {
      if (!isValidBarcode(barcode) || (/^\d{13}$/.test(barcode) && !isValidEan13(barcode))) {
        at("barcode", `বারকোড "${barcode}" ঠিক নয় (EAN-13 checksum মেলেনি)।`);
      } else if ((current?.barcode ?? null) !== barcode) {
        const other = context.fileBarcodes.get(barcode);
        if (other !== undefined && other !== `${group.key}|${comboKey}`)
          at("barcode", `বারকোড ${barcode} ফাইলে দুবার।`);
        context.fileBarcodes.set(barcode, `${group.key}|${comboKey}`);
        if (current !== undefined && !canWrite) at("barcode", "বারকোড বদলানোর অনুমতি নেই।");
        variant.barcode = barcode;
        change("barcode", current?.barcode ?? "", barcode);
      }
    }

    // price and compare-at price
    let price = current?.pricePoisha ?? null;
    const priceCell = cell("price_tk");
    if (priceCell !== "") {
      const parsed = parseMoneyCell(priceCell);
      if ("error" in parsed) at("price_tk", parsed.error);
      else if (parsed.value <= 0) at("price_tk", "দাম ০-এর বেশি হতে হবে।");
      else if (parsed.value !== current?.pricePoisha) {
        if (!canPrice) at("price_tk", "দাম বদলানোর অনুমতি (catalog.price.write) নেই।");
        price = parsed.value;
        variant.pricePoisha = parsed.value;
        change("price_tk", takaText(current?.pricePoisha), takaText(parsed.value));
      }
    } else if (current === undefined) at("price_tk", "নতুন ভ্যারিয়েন্টে price_tk লাগবে।");

    let compare = current?.comparePricePoisha ?? null;
    const compareCell = cell("compare_at_tk");
    if (compareCell !== "") {
      const parsed = isClear(compareCell) ? { value: null } : parseMoneyCell(compareCell);
      if ("error" in parsed) at("compare_at_tk", parsed.error);
      else if (parsed.value !== (current?.comparePricePoisha ?? null)) {
        if (!canPrice) at("compare_at_tk", "দাম বদলানোর অনুমতি (catalog.price.write) নেই।");
        compare = parsed.value;
        variant.comparePricePoisha = parsed.value;
        change("compare_at_tk", takaText(current?.comparePricePoisha), takaText(parsed.value));
      }
    }
    if (compare !== null && price !== null && compare <= price) {
      at("compare_at_tk", "ছাড়ের আগের দাম বর্তমান দামের চেয়ে বেশি হতে হবে।");
    }
    if (price !== null && price > 0) effectivePrices += 1;

    // weight
    const weightCell = cell("weight_g");
    if (weightCell !== "") {
      const parsed = isClear(weightCell)
        ? { value: null }
        : parseWholeNumber(weightCell, MAX_WEIGHT_G);
      if ("error" in parsed) at("weight_g", parsed.error);
      else if (parsed.value !== (current?.weightGrams ?? null)) {
        if (current !== undefined && !canWrite) at("weight_g", "ওজন বদলানোর অনুমতি নেই।");
        variant.weightGrams = parsed.value;
        change("weight_g", String(current?.weightGrams ?? ""), String(parsed.value ?? ""));
      }
    }

    // opening cost
    const costCell = cell("cost_tk");
    if (costCell !== "" && context.includeCost) {
      const parsed = parseMoneyCell(costCell);
      if ("error" in parsed) at("cost_tk", parsed.error);
      else if (current !== undefined && current._count.movements > 0) {
        if (parsed.value !== current.costPoisha) {
          warn(
            "cost_tk",
            `${current.sku}: স্টকের হিসাব শুরু হয়ে গেছে, তাই ক্রয়মূল্য বদলাবে না (গড় হিসাবই ঠিক)।`,
            row.row,
          );
        }
      } else if (parsed.value !== (current?.costPoisha ?? null)) {
        variant.costPoisha = parsed.value;
        // The amount is not shown in the preview, only that it changes.
        change("cost_tk", current?.costPoisha == null ? "" : "•••", "•••");
      }
    }

    if (current !== undefined) variant.id = current.id;
    if (changed) payload.variants.push(variant);
  }

  // --- status ---------------------------------------------------------------
  let requestedPublish = false;
  const statusCell = (cells.status ?? "").toUpperCase();
  // The current status (ARCHIVED too, as the export writes it) means no change.
  if (statusCell !== "" && statusCell !== (graph?.status ?? "DRAFT")) {
    if (statusCell !== "DRAFT" && statusCell !== "PUBLISHED") {
      error("status", `status "${cells.status}" — DRAFT বা PUBLISHED লিখুন।`);
    } else if (statusCell !== (graph?.status ?? "DRAFT")) {
      if (!canPublish) error("status", "publish/draft বদলানোর অনুমতি (catalog.publish) নেই।");
      else if (statusCell === "DRAFT") {
        payload.status = "DRAFT";
        diff.push({ field: "status", sku: null, before: graph?.status ?? "", after: "DRAFT" });
      } else {
        requestedPublish = true;
        const nameEn = (scalars.nameEn ?? graph?.nameEn ?? "") as string;
        const nameBn = scalars.nameBn !== undefined ? scalars.nameBn : (graph?.nameBn ?? null);
        const missing = missingForPublish({
          nameEn,
          nameBn,
          imageCount: graph?.images.length ?? 0,
          variants: [
            ...existingVariants.map((variant) => ({
              isActive: variant.isActive,
              deleted: false,
              pricePoisha: variant.pricePoisha,
            })),
            ...Array.from({ length: Math.max(0, effectivePrices) }, () => ({
              isActive: true,
              deleted: false,
              pricePoisha: 1,
            })),
          ],
        });
        if (missing.length === 0 && graph !== null) {
          payload.status = "PUBLISHED";
          diff.push({ field: "status", sku: null, before: graph.status, after: "PUBLISHED" });
        } else {
          warn(
            "status",
            missing.includes("image")
              ? "ছবি নেই — ছবি আপলোডের পর publish করা যাবে (ছবির বাল্ক আপলোড পেজ)।"
              : `এখনই publish করা যাবে না (${missing.join(", ")})। draft থাকবে।`,
          );
        }
      }
    }
  }

  // --- the outcome -----------------------------------------------------------
  const nameForList =
    (scalars.nameEn as string | undefined) ?? graph?.nameEn ?? cells.name_en ?? "(নামহীন)";
  const hasChanges =
    isNew ||
    Object.keys(scalars).length > 0 ||
    payload.extraCategoryIds !== undefined ||
    payload.tagIds !== undefined ||
    payload.status !== undefined ||
    payload.variants.length > 0;
  const action: ImportRowWrite["action"] =
    errors.length > 0 ? "ERROR" : isNew ? "CREATE" : hasChanges ? "UPDATE" : "UNCHANGED";

  return {
    errors,
    warnings,
    write: {
      position,
      productCode: graph?.code ?? group.code,
      productName: nameForList,
      productId: graph?.id ?? null,
      rowNumbers: group.rows.map((row) => row.row),
      action,
      payload: payload,
      diff: diff.length === 0 ? null : diff,
      errors: errors.length === 0 ? null : errors,
      warnings: warnings.length === 0 ? null : warnings,
      sourceRows: group.rows.map((row) => ({
        row: row.row,
        cells: row.source,
      })),
      requestedPublish,
      expectedVersion: graph?.version ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// check (dry run)
// ---------------------------------------------------------------------------

export function canImport(staff: StaffContext): boolean {
  return hasPermission(staff, "catalog.import");
}

export async function checkProductImport(actor: StaffContext, file: FileInput, meta: RequestMeta) {
  assertPermission(actor, "catalog.import");
  const settings = await getImportSettings();
  const fileErrors: ImportIssue[] = [];
  if (file.bytes.byteLength === 0)
    fileErrors.push({ row: null, column: null, message: "ফাইলটা খালি।" });
  if (file.bytes.byteLength > settings.maxBytes) {
    fileErrors.push({
      row: null,
      column: null,
      message: `ফাইল ${Math.round(settings.maxBytes / 1024)} KB-এর বড়। ফাইল ভাগ করুন।`,
    });
  }
  if (fileErrors.length > 0) throw new AppError("VALIDATION_FAILED", fileErrors[0]!.message);

  const read = await readTable(file);
  if ("error" in read) throw new AppError("VALIDATION_FAILED", read.error);
  const sheet = readProductSheet(unguard(read.table), read.rowNumbers, {
    maxRows: settings.maxRows,
  });
  if (sheet.errors.some((issue) => issue.row === null)) {
    throw new AppError(
      "VALIDATION_FAILED",
      sheet.errors.find((issue) => issue.row === null)!.message,
    );
  }

  const includeCost = hasPermission(actor, "inventory.cost.read");
  const fileWarnings: ImportIssue[] = [...sheet.warnings];
  if (sheet.columns.includes("cost_tk") && !includeCost) {
    fileWarnings.push({
      row: null,
      column: "cost_tk",
      message: "ক্রয়মূল্য দেখার অনুমতি নেই, তাই cost_tk কলাম পুরোটাই উপেক্ষা করা হবে।",
    });
  }

  const skus = sheet.rows.map((row) => row.cells.sku ?? "").filter(Boolean);
  const [refs, catalogSettings, skuOwners] = await Promise.all([
    findImportReferences(),
    getCatalogSettings(),
    findVariantOwnersBySkus(skus),
  ]);
  // Older products without a code are found through their SKUs ("#<id>").
  const ownerBySku = new Map(
    [...skuOwners].map(
      ([sku, owner]) => [sku, owner.code?.toUpperCase() ?? `#${owner.productId}`] as const,
    ),
  );
  const groups = groupProducts(sheet.rows, ownerBySku);
  const codes = groups.flatMap((group) =>
    group.code === null || group.code.startsWith("#") ? [] : [group.code],
  );
  const ids = groups.flatMap((group) => (group.code?.startsWith("#") ? [group.code.slice(1)] : []));
  const products = [...(await findProductsByCodes(codes)), ...(await findProductsByIds(ids))];
  const context: Context = {
    actor,
    refs,
    fits: catalogSettings.fits,
    includeCost,
    createMissingOptions: settings.createMissingOptions,
    productsByCode: new Map(
      products.map((product) => [(product.code ?? "").toUpperCase(), product]),
    ),
    productsById: new Map(products.map((product) => [product.id, product])),
    skuOwners,
    fileSkus: new Map(),
    fileBarcodes: new Map(),
    plannedSlugs: new Set(),
  };

  const planned = groups.map((group, index) => planProduct(context, group, index));
  // Sheet-level row errors (an extra cell, say) belong to their product.
  for (const issue of sheet.errors) {
    const owner = planned.find((row) => row.write.rowNumbers.includes(issue.row ?? -1));
    if (owner !== undefined) {
      owner.errors.push(issue);
      owner.write.action = "ERROR";
      owner.write.errors = owner.errors;
    }
  }
  // Barcodes typed for new or changed variants must be free.
  const typedBarcodes = [...context.fileBarcodes.keys()];
  const keptIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
  const ownBarcodes = new Map(
    products.flatMap((product) =>
      product.variants.flatMap((variant) =>
        variant.barcode === null ? [] : [[variant.barcode, variant.id] as const],
      ),
    ),
  );
  const taken = await findTakenBarcodesFor(typedBarcodes, keptIds);
  for (const row of planned) {
    const payload = row.write.payload as unknown as ImportPayload;
    for (const variant of payload.variants) {
      if (
        typeof variant.barcode === "string" &&
        (taken.has(variant.barcode) ||
          (ownBarcodes.has(variant.barcode) && ownBarcodes.get(variant.barcode) !== variant.id))
      ) {
        row.errors.push({
          row: row.write.rowNumbers[0] ?? null,
          column: "barcode",
          message: `বারকোড ${variant.barcode} অন্য ভ্যারিয়েন্টে আছে।`,
        });
        row.write.action = "ERROR";
        row.write.errors = row.errors;
      }
    }
  }

  const count = (action: ImportRowWrite["action"]) =>
    planned.filter((row) => row.write.action === action).length;
  const sha = createHash("sha256").update(file.bytes).digest("hex");
  const created = await createImportRecord({
    fileName: file.fileName.slice(0, 200),
    fileSha256: sha,
    fileKind: read.kind,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    createCount: count("CREATE"),
    updateCount: count("UPDATE"),
    unchangedCount: count("UNCHANGED"),
    errorCount: count("ERROR"),
    warningCount: fileWarnings.length + planned.reduce((sum, row) => sum + row.warnings.length, 0),
    warnings: fileWarnings.length === 0 ? null : fileWarnings,
    includeCost,
    createdById: actor.userId,
    rows: planned.map((row) => row.write),
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.importChecked,
    entityType: "product_import",
    entityId: created.id,
    after: {
      fileName: file.fileName,
      sha256: sha,
      rows: sheet.rows.length,
      products: planned.length,
    },
    meta,
  });
  return created;
}

// ---------------------------------------------------------------------------
// the preview
// ---------------------------------------------------------------------------

export async function getImportPreview(actor: StaffContext, importId: string) {
  assertPermission(actor, "catalog.import");
  const record = await findImport(importId);
  if (record === null) throw new AppError("NOT_FOUND", "Import not found.");
  const settings = await getImportSettings();
  const [rows, duplicate, names] = await Promise.all([
    findImportRows(importId),
    findDoneImportWithHash(record.fileSha256, record.id),
    findUserNames([record.createdById]),
  ]);
  const duplicateBy =
    duplicate === null
      ? null
      : ((await findUserNames([duplicate.createdById])).get(duplicate.createdById) ?? null);
  const expired = Date.now() - record.createdAt.getTime() > VALID_FOR_MS;
  const isOwner = record.createdById === actor.userId;
  const atomicTooBig = record.rowCount > settings.atomicMaxRows;
  return {
    id: record.id,
    fileName: record.fileName,
    fileKind: record.fileKind,
    status: record.status,
    mode: record.mode,
    createdAt: record.createdAt.toISOString(),
    createdBy: names.get(record.createdById) ?? "",
    finishedAt: record.finishedAt?.toISOString() ?? null,
    failureReason: record.failureReason,
    counts: {
      rows: record.rowCount,
      create: record.createCount,
      update: record.updateCount,
      unchanged: record.unchangedCount,
      error: record.errorCount,
      warning: record.warningCount,
      applied: record.appliedCount,
      skipped: record.skippedCount,
    },
    fileWarnings: (record.warnings as ImportIssue[] | null) ?? [],
    includeCost: record.includeCost,
    duplicate:
      duplicate === null
        ? null
        : { at: duplicate.finishedAt?.toISOString() ?? null, by: duplicateBy },
    expired,
    canApply:
      isOwner &&
      !expired &&
      record.status === "VALIDATED" &&
      record.createCount + record.updateCount > 0,
    allowPartial: settings.allowPartial,
    atomicMaxRows: settings.atomicMaxRows,
    atomicTooBig,
    rows: rows.map((row) => ({
      id: row.id,
      position: row.position,
      productCode: row.productCode,
      productName: row.productName,
      productId: row.productId,
      rowNumbers: row.rowNumbers,
      action: row.action,
      diff: (row.diff as DiffEntry[] | null) ?? [],
      errors: (row.errors as ImportIssue[] | null) ?? [],
      warnings: (row.warnings as ImportIssue[] | null) ?? [],
      newVariants: ((row.payload as unknown as ImportPayload).variants ?? []).filter(
        (variant) => variant.id === undefined,
      ).length,
      requestedPublish: row.requestedPublish,
      outcome: row.outcome,
      outcomeReason: row.outcomeReason,
    })),
  };
}

export type ImportPreview = Awaited<ReturnType<typeof getImportPreview>>;

export async function listProductImports(actor: StaffContext) {
  assertPermission(actor, "catalog.import");
  const rows = await listImports(50);
  const names = await findUserNames(rows.map((row) => row.createdById));
  return rows.map((row) => ({ ...row, createdBy: names.get(row.createdById) ?? "" }));
}

/** The file's rows with an `error` column — fix in Excel and upload again. */
export async function importErrorsCsv(actor: StaffContext, importId: string): Promise<string> {
  assertPermission(actor, "catalog.import");
  const record = await findImport(importId);
  if (record === null) throw new AppError("NOT_FOUND", "Import not found.");
  const rows = await findImportRows(importId);
  const lines = [csvLine([...record.headers.map((header) => csvField(header)), csvField("error")])];
  for (const row of rows) {
    if (row.action !== "ERROR" && row.outcome !== "SKIPPED") continue;
    const errors = (row.errors as ImportIssue[] | null) ?? [];
    const sources = row.sourceRows as unknown as Array<{ row: number; cells: string[] }>;
    for (const source of sources) {
      const messages = errors
        .filter((issue) => issue.row === source.row || issue.row === null)
        .map((issue) =>
          issue.column === null ? issue.message : `${issue.column}: ${issue.message}`,
        );
      if (messages.length === 0 && row.outcomeReason !== null) messages.push(row.outcomeReason);
      if (messages.length === 0) messages.push("এই প্রোডাক্টের অন্য সারিতে ত্রুটি আছে।");
      const cells = record.headers.map((_, index) => csvField(source.cells[index] ?? ""));
      lines.push(csvLine([...cells, csvField(`সারি ${source.row}: ${messages.join(" | ")}`)]));
    }
  }
  return CSV_BOM + lines.join("");
}

// ---------------------------------------------------------------------------
// applying
// ---------------------------------------------------------------------------

function scalarsOf(graph: ImportProductGraph): ProductScalars {
  return {
    slug: graph.slug,
    nameEn: graph.nameEn,
    nameBn: graph.nameBn,
    summaryEn: graph.summaryEn,
    summaryBn: graph.summaryBn,
    descriptionEn: jsonList(graph.descriptionEn),
    descriptionBn: jsonList(graph.descriptionBn),
    fabricEn: graph.fabricEn,
    fabricBn: graph.fabricBn,
    careEn: jsonList(graph.careEn),
    careBn: jsonList(graph.careBn),
    categoryId: graph.categoryId,
    brandId: graph.brandId,
    sizeChartId: graph.sizeChartId,
    fit: graph.fit,
    isNew: graph.isNew,
    isFeatured: graph.isFeatured,
    isBestseller: graph.isBestseller,
    seoTitleEn: graph.seoTitleEn,
    seoTitleBn: graph.seoTitleBn,
    seoDescriptionEn: graph.seoDescriptionEn,
    seoDescriptionBn: graph.seoDescriptionBn,
  };
}

async function freeSlug(tx: CatalogTx, nameEn: string): Promise<string> {
  const base = slugify(nameEn).slice(0, 80) || "product";
  const taken = await findSlugsStartingWith(tx, base);
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
  }
  return `${base}-${Date.now()}`;
}

class SkipProduct extends Error {}

/** Writes one planned product inside `tx`; throws SkipProduct when it must be skipped. */
async function applyRow(
  tx: CatalogTx,
  row: {
    productId: string | null;
    productName: string;
    expectedVersion: number | null;
    payload: unknown;
  },
  settings: { skuPattern: string; productCodePrefix: string },
) {
  const payload = row.payload as ImportPayload;
  const graph =
    payload.productId === null ? null : await findProductForImport(tx, payload.productId);
  if (payload.productId !== null && (graph === null || graph.version !== row.expectedVersion)) {
    throw new SkipProduct(
      `আমদানি যাচাইয়ের পর "${row.productName}" এডিট হয়েছে — নতুন করে আমদানি চালান।`,
    );
  }
  const { tagIds: newTagIds, presetIds } = await ensureTagsAndPresets(
    tx,
    payload.newTags,
    payload.newPresets,
  );

  // option values: every existing one stays; presets are copied on first use
  const options: PlannedOptionValue[] = [];
  const labelOf = new Map<string, { code: string; en: string; bn: string | null }>();
  for (const option of graph?.options ?? []) {
    for (const value of option.values) {
      options.push({ ref: value.id, type: option.type, existingId: value.id });
      labelOf.set(value.id, {
        code: value.code ?? toSkuSegment(value.valueEn).slice(0, option.type === "COLOUR" ? 3 : 6),
        en: value.valueEn,
        bn: value.valueBn,
      });
    }
  }
  const presetIdsUsed = payload.variants.flatMap((variant) =>
    [variant.size, variant.colour].flatMap((choice) =>
      choice?.kind === "preset" ? [choice.presetId] : [],
    ),
  );
  const newPresetIds = payload.variants.flatMap((variant) =>
    [variant.size, variant.colour].flatMap((choice) =>
      choice?.kind === "new" ? [presetIds.get(`${choice.type}:${choice.code}`) ?? ""] : [],
    ),
  );
  const presets = new Map(
    (await findPresetsForImport(tx, [...presetIdsUsed, ...newPresetIds])).map((preset) => [
      preset.id,
      preset,
    ]),
  );
  const refFor = (choice: OptionChoice | null | undefined): string | null => {
    if (choice === null || choice === undefined) return null;
    if (choice.kind === "existing") return choice.valueId;
    const presetId =
      choice.kind === "preset"
        ? choice.presetId
        : (presetIds.get(`${choice.type}:${choice.code}`) ?? "");
    const ref = `preset:${presetId}`;
    if (labelOf.has(ref)) return ref;
    const preset = presets.get(presetId);
    if (preset === undefined) throw new SkipProduct(`"${row.productName}": একটা সাইজ/রঙ আর নেই।`);
    const sameName = (graph?.options ?? [])
      .filter((option) => option.type === preset.type)
      .flatMap((option) => option.values)
      .find((value) => value.valueEn === preset.valueEn);
    if (sameName !== undefined) return sameName.id;
    options.push({
      ref,
      type: preset.type,
      create: {
        valueEn: preset.valueEn,
        valueBn: preset.valueBn,
        hex: preset.hex,
        code: preset.code,
        presetId: preset.id,
        sortOrder: preset.sortOrder,
      },
    });
    labelOf.set(ref, { code: preset.code, en: preset.valueEn, bn: preset.valueBn });
    return ref;
  };

  const changes = new Map(
    payload.variants
      .filter((variant) => variant.id !== undefined)
      .map((variant) => [variant.id!, variant]),
  );
  const variants: PlannedVariant[] = (graph?.variants ?? []).map((current) => {
    const change = changes.get(current.id);
    return {
      id: current.id,
      sizeRef: null,
      colourRef: null,
      sku: current.sku,
      skuParts: { size: null, colour: null },
      barcode: change?.barcode !== undefined ? change.barcode : current.barcode,
      pricePoisha: change?.pricePoisha ?? current.pricePoisha,
      comparePricePoisha:
        change?.comparePricePoisha !== undefined
          ? change.comparePricePoisha
          : current.comparePricePoisha,
      weightGrams: change?.weightGrams !== undefined ? change.weightGrams : current.weightGrams,
      isActive: current.isActive,
      labelEn: current.labelEn,
      labelBn: current.labelBn,
      ...(change?.costPoisha === undefined || current._count.movements > 0
        ? {}
        : { costPoisha: change.costPoisha }),
    };
  });
  for (const variant of payload.variants) {
    if (variant.id !== undefined) continue;
    const sizeRef = refFor(variant.size);
    const colourRef = refFor(variant.colour);
    const size = sizeRef === null ? undefined : labelOf.get(sizeRef);
    const colour = colourRef === null ? undefined : labelOf.get(colourRef);
    const label = (locale: "en" | "bn") => {
      const parts = [size, colour]
        .filter((value): value is NonNullable<typeof value> => value !== undefined)
        .map((value) => (locale === "bn" ? (value.bn ?? value.en) : value.en));
      return parts.length === 0 ? null : parts.join(" / ");
    };
    variants.push({
      sizeRef,
      colourRef,
      sku: variant.sku,
      skuParts: { size: size?.code ?? null, colour: colour?.code ?? null },
      barcode: variant.barcode ?? null,
      pricePoisha: variant.pricePoisha ?? 0,
      comparePricePoisha: variant.comparePricePoisha ?? null,
      weightGrams: variant.weightGrams ?? null,
      isActive: true,
      labelEn: label("en"),
      labelBn: label("bn"),
      ...(variant.costPoisha === undefined ? {} : { costPoisha: variant.costPoisha }),
    });
  }

  const base: ProductScalars =
    graph === null
      ? {
          slug: "",
          nameEn: "",
          nameBn: null,
          summaryEn: null,
          summaryBn: null,
          descriptionEn: null,
          descriptionBn: null,
          fabricEn: null,
          fabricBn: null,
          careEn: null,
          careBn: null,
          categoryId: "",
          brandId: null,
          sizeChartId: null,
          fit: null,
          isNew: false,
          isFeatured: false,
          isBestseller: false,
          seoTitleEn: null,
          seoTitleBn: null,
          seoDescriptionEn: null,
          seoDescriptionBn: null,
        }
      : scalarsOf(graph);
  const scalars: ProductScalars = { ...base, ...payload.scalars };
  if (graph === null) scalars.slug = await freeSlug(tx, scalars.nameEn);

  const resolveTag = (id: string) =>
    id.startsWith("new:") ? (newTagIds.get(id.slice(4)) ?? null) : id;
  const plan: ProductGraphPlan = {
    ...(graph === null
      ? {
          newProductCode: {
            prefix: settings.productCodePrefix,
            categoryCode: payload.categoryCode ?? "",
          },
        }
      : { productId: graph.id, expectedVersion: graph.version }),
    skuPattern: settings.skuPattern,
    scalars,
    extraCategoryIds:
      payload.extraCategoryIds ?? (graph?.extraCategories ?? []).map((row) => row.categoryId),
    tagIds: [
      ...new Set(
        (payload.tagIds ?? (graph?.tags ?? []).map((row) => row.tagId))
          .map(resolveTag)
          .filter((id): id is string => id !== null),
      ),
    ],
    optionValues: options,
    variants,
    archiveVariantIds: [],
    images: (graph?.images ?? []).map((image) => ({
      id: image.id,
      altEn: image.altEn,
      altBn: image.altBn,
      colourRef: image.optionValueId,
    })),
    removeImageIds: [],
    ...(payload.status === undefined ? {} : { status: payload.status }),
  };
  const saved = await writeProductGraph(tx, plan);

  const priceChanges = payload.variants.filter(
    (variant) => variant.pricePoisha !== undefined || variant.comparePricePoisha !== undefined,
  );
  return { saved, isNew: graph === null, priceChanges, before: graph };
}

function skipReason(error: unknown, productName: string): string {
  if (error instanceof SkipProduct) return error.message;
  if (uniqueViolationTarget(error) !== null) {
    return `"${productName}": SKU, বারকোড বা slug অন্য প্রোডাক্টে চলে গেছে — নতুন করে আমদানি চালান।`;
  }
  if (error instanceof Error && error.name === "ProductVersionConflict") {
    return `আমদানি যাচাইয়ের পর "${productName}" এডিট হয়েছে — নতুন করে আমদানি চালান।`;
  }
  return `"${productName}" সেভ করা গেল না।`;
}

async function auditApplied(
  actor: StaffContext,
  results: Array<Awaited<ReturnType<typeof applyRow>>>,
  meta: RequestMeta,
) {
  for (const result of results) {
    await recordAudit({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.productImported,
      entityType: "product",
      entityId: result.saved.id,
      after: { code: result.saved.code, created: result.isNew, version: result.saved.version },
      meta,
    });
    if (result.priceChanges.length > 0) {
      const before = new Map(
        (result.before?.variants ?? []).map((variant) => [variant.id, variant]),
      );
      await recordAudit({
        actorUserId: actor.userId,
        action: AUDIT_ACTIONS.priceImported,
        entityType: "product",
        entityId: result.saved.id,
        before: result.priceChanges.map((change) => {
          const current = change.id === undefined ? undefined : before.get(change.id);
          return {
            sku: current?.sku ?? change.sku,
            price: current?.pricePoisha ?? null,
            compare: current?.comparePricePoisha ?? null,
          };
        }),
        after: result.priceChanges.map((change) => ({
          sku: change.sku || "(new)",
          price: change.pricePoisha ?? null,
          compare: change.comparePricePoisha ?? null,
        })),
        meta,
      });
    }
  }
}

async function loadForApply(actor: StaffContext, importId: string) {
  assertPermission(actor, "catalog.import");
  const record = await findImport(importId);
  if (record === null) throw new AppError("NOT_FOUND", "Import not found.");
  if (record.createdById !== actor.userId) {
    throw forbidden("Only the person who checked this file can apply it.");
  }
  if (Date.now() - record.createdAt.getTime() > VALID_FOR_MS) {
    throw new AppError("CONFLICT", "এই যাচাই ২৪ ঘণ্টার বেশি পুরনো। ফাইলটা আবার আপলোড করুন।");
  }
  return record;
}

function assertNotDuplicate(duplicate: unknown, confirmDuplicate: boolean) {
  if (duplicate !== null && !confirmDuplicate) {
    throw new AppError("CONFLICT", "এই ফাইল আগে আমদানি হয়েছে। নিশ্চিত হলে আবার চাপুন।", {
      details: { reason: "duplicate_file" },
    });
  }
}

/** All or nothing: one transaction; any problem saves nothing. */
export async function applyProductImport(
  actor: StaffContext,
  importId: string,
  options: { confirmDuplicate: boolean },
  meta: RequestMeta,
) {
  const record = await loadForApply(actor, importId);
  const settings = await getImportSettings();
  if (record.status !== "VALIDATED")
    throw new AppError("CONFLICT", "এই আমদানি আগেই চালানো হয়েছে।");
  if (record.errorCount > 0)
    throw new AppError("VALIDATION_FAILED", "ত্রুটি ০ হলে তবেই আমদানি করা যায়।");
  if (record.rowCount > settings.atomicMaxRows) {
    throw new AppError(
      "VALIDATION_FAILED",
      `সব-অথবা-কিছুই-না মোডে সর্বোচ্চ ${settings.atomicMaxRows} সারি। ফাইল ভাগ করুন, অথবা 'শুধু ভালোগুলো' মোড ব্যবহার করুন।`,
    );
  }
  assertNotDuplicate(
    await findDoneImportWithHash(record.fileSha256, record.id),
    options.confirmDuplicate,
  );
  if (
    !(await updateImportStatus(record.id, ["VALIDATED"], {
      status: "APPLYING",
      mode: "ALL_OR_NOTHING",
    }))
  ) {
    throw new AppError("CONFLICT", "এই আমদানি আগেই চালানো হয়েছে।");
  }

  const catalog = await getCatalogSettings();
  const rows = (await findImportRows(record.id)).filter(
    (row) => row.action === "CREATE" || row.action === "UPDATE",
  );
  let results: Array<Awaited<ReturnType<typeof applyRow>> & { rowId: string }>;
  try {
    results = await inImportTransaction(async (tx) => {
      const done = [];
      for (const row of rows) {
        try {
          done.push({ ...(await applyRow(tx, row, catalog)), rowId: row.id });
        } catch (error) {
          throw new SkipProduct(skipReason(error, row.productName));
        }
      }
      return done;
    });
  } catch (error) {
    const reason =
      error instanceof SkipProduct ? error.message : "আমদানি সেভ করা গেল না; কিছুই বদলায়নি।";
    if (!(error instanceof SkipProduct))
      console.error("[import] apply failed", error instanceof Error ? error.name : "");
    await updateImportStatus(record.id, ["APPLYING"], {
      status: "FAILED",
      failureReason: reason,
      finishedAt: new Date(),
    });
    throw new AppError("CONFLICT", `${reason} কিছুই সেভ হয়নি।`);
  }

  for (const result of results) await markImportRow(result.rowId, "APPLIED", null, result.saved.id);
  await updateImportStatus(record.id, ["APPLYING"], {
    status: "DONE",
    appliedCount: results.length,
    finishedAt: new Date(),
  });
  await auditApplied(actor, results, meta);
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.importApplied,
    entityType: "product_import",
    entityId: record.id,
    after: {
      fileName: record.fileName,
      sha256: record.fileSha256,
      mode: "ALL_OR_NOTHING",
      applied: results.length,
    },
    meta,
  });
  return {
    applied: results.length,
    skipped: 0,
    done: true,
    slugs: results.map((result) => result.saved.slug),
  };
}

/**
 * Good products only: a chunk at a time (25 products or about 8 seconds),
 * each product in its own transaction. Call again until `done`.
 */
export async function applyImportChunk(
  actor: StaffContext,
  importId: string,
  options: { confirmDuplicate: boolean },
  meta: RequestMeta,
) {
  const record = await loadForApply(actor, importId);
  const settings = await getImportSettings();
  if (!settings.allowPartial) throw forbidden("“শুধু ভালোগুলো” মোড Settings-এ বন্ধ।");
  if (record.status === "VALIDATED") {
    assertNotDuplicate(
      await findDoneImportWithHash(record.fileSha256, record.id),
      options.confirmDuplicate,
    );
    await updateImportStatus(record.id, ["VALIDATED"], { status: "APPLYING", mode: "GOOD_ONLY" });
  } else if (record.status !== "APPLYING" || record.mode !== "GOOD_ONLY") {
    throw new AppError("CONFLICT", "এই আমদানি আর চালানো যাবে না।");
  }

  const catalog = await getCatalogSettings();
  const started = Date.now();
  const rows = await findPendingImportRows(record.id, CHUNK_PRODUCTS);
  const results: Array<Awaited<ReturnType<typeof applyRow>>> = [];
  let skipped = 0;
  for (const row of rows) {
    if (Date.now() - started > CHUNK_MS) break;
    try {
      const result = await inImportTransaction((tx) => applyRow(tx, row, catalog));
      await markImportRow(row.id, "APPLIED", null, result.saved.id);
      results.push(result);
    } catch (error) {
      skipped += 1;
      await markImportRow(row.id, "SKIPPED", skipReason(error, row.productName), null);
    }
  }
  await auditApplied(actor, results, meta);

  const remaining = (await findPendingImportRows(record.id, 1)).length;
  const totals = await countImportOutcomes(record.id);
  const done = remaining === 0;
  await updateImportStatus(record.id, ["APPLYING"], {
    appliedCount: totals.applied,
    skippedCount: totals.skipped + record.errorCount,
    ...(done ? { status: "DONE", finishedAt: new Date() } : {}),
  });
  if (done) {
    await recordAudit({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.importApplied,
      entityType: "product_import",
      entityId: record.id,
      after: {
        fileName: record.fileName,
        sha256: record.fileSha256,
        mode: "GOOD_ONLY",
        applied: totals.applied,
        skipped: totals.skipped + record.errorCount,
      },
      meta,
    });
  }
  return {
    applied: results.length,
    skipped,
    done,
    totals,
    total: record.createCount + record.updateCount,
    slugs: results.map((result) => result.saved.slug),
  };
}

export async function cancelProductImport(actor: StaffContext, importId: string) {
  const record = await loadForApply(actor, importId);
  if (
    !(await updateImportStatus(record.id, ["VALIDATED", "APPLYING"], {
      status: "CANCELLED",
      finishedAt: new Date(),
    }))
  ) {
    throw new AppError("CONFLICT", "এই আমদানি আর থামানো যাবে না।");
  }
}

// ---------------------------------------------------------------------------
// template and help
// ---------------------------------------------------------------------------

/** Headings plus two example products; rows start with EXAMPLE- and are refused. */
export function importTemplateCsv(): string {
  const headers = IMPORT_COLUMNS.map((column) => column.key);
  const row = (values: Record<string, string>) =>
    csvLine(headers.map((key) => csvField(values[key] ?? "")));
  const shirt = {
    name_en: "Example Oxford shirt",
    name_bn: "উদাহরণ অক্সফোর্ড শার্ট",
    description_en: "Soft cotton Oxford weave.",
    category_code: "SH",
    status: "DRAFT",
  };
  const lines = [csvLine(headers.map((header) => csvField(header)))];
  for (const [colour, sizes] of [
    ["WHT", ["M", "L", "XL"]],
    ["BLU", ["M", "L", "XL"]],
  ] as const) {
    for (const size of sizes) {
      lines.push(
        row({
          ...shirt,
          size,
          colour,
          sku: `EXAMPLE-SH-${colour}-${size}`,
          price_tk: "1,250",
          weight_g: "250",
        }),
      );
    }
  }
  const pants = { name_en: "Example chino trousers", category_code: "PT", status: "DRAFT" };
  for (const size of ["30", "32", "34", "36"]) {
    lines.push(
      row({ ...pants, size, colour: "KHK", sku: `EXAMPLE-PT-KHK-${size}`, price_tk: "1,850" }),
    );
  }
  return CSV_BOM + lines.join("");
}

export async function getImportHelp(actor: StaffContext) {
  assertPermission(actor, "catalog.import");
  const [refs, catalog, settings] = await Promise.all([
    findImportReferences(),
    getCatalogSettings(),
    getImportSettings(),
  ]);
  return {
    columns: IMPORT_COLUMNS,
    categories: refs.categories.filter((category) => category.code !== null),
    brands: refs.brands,
    sizeCharts: refs.sizeCharts,
    sizes: refs.presets.filter((preset) => preset.type === "SIZE"),
    colours: refs.presets.filter((preset) => preset.type === "COLOUR"),
    fits: catalog.fits,
    settings,
    canSeeCost: hasPermission(actor, "inventory.cost.read"),
  };
}
