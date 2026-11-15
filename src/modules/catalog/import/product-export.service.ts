import "server-only";

import { assertPermission, hasPermission, type StaffContext } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import type { CsvColumn } from "@/modules/reports/report-csv";
import { productListQuerySchema } from "../catalog.schema";
import { searchTerms } from "../search-text";
import {
  findProductsForExport,
  type ExportFilter,
  type ExportProduct,
} from "./product-import.repository";
import { IMPORT_COLUMNS } from "./product-sheet";

/**
 * Product export (Phase 12): the import's columns in the import's order, one
 * row per live variant, product cells repeated on every row — so a file can
 * be changed in Excel and imported again. Purchase cost only for staff who may
 * see it. Streamed page by page.
 */

const PAGE = 200;

export type ExportRow = Record<string, string>;

function filterFrom(raw: Record<string, string | undefined>): ExportFilter {
  const query = productListQuerySchema.parse(raw);
  return {
    terms: searchTerms(query.q ?? ""),
    ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
    ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
}

function taka(poisha: number | null): string {
  if (poisha === null) return "";
  const rest = poisha % 100;
  return `${Math.floor(poisha / 100)}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

function list(value: unknown, separator: string): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join(separator)
    : "";
}

/** The CSV columns this staff member gets (cost only with inventory.cost.read). */
export function exportColumns(staff: StaffContext): CsvColumn<ExportRow>[] {
  const withCost = hasPermission(staff, "inventory.cost.read");
  return IMPORT_COLUMNS.filter((column) => column.key !== "cost_tk" || withCost).map((column) => ({
    header: column.key,
    kind: "text" as const,
    value: (row: ExportRow) => row[column.key] ?? "",
  }));
}

export function exportRows(product: ExportProduct, withCost: boolean): ExportRow[] {
  const values = new Map(
    product.options.flatMap((option) =>
      option.values.map((value) => [value.id, { type: option.type, value }] as const),
    ),
  );
  const shared: ExportRow = {
    product_code: product.code ?? "",
    name_en: product.nameEn,
    name_bn: product.nameBn ?? "",
    description_en: list(product.descriptionEn, "\n\n"),
    description_bn: list(product.descriptionBn, "\n\n"),
    category_code: product.category.code ?? "",
    extra_category_codes: product.extraCategories
      .map((row) => row.category.code ?? "")
      .filter(Boolean)
      .join(";"),
    brand: product.brand?.nameEn ?? "",
    fabric_en: product.fabricEn ?? "",
    fabric_bn: product.fabricBn ?? "",
    fit: product.fit ?? "",
    care_en: list(product.careEn, "\n"),
    care_bn: list(product.careBn, "\n"),
    tags: product.tags.map((row) => row.tag.nameEn).join(";"),
    size_chart: product.sizeChart?.nameEn ?? "",
    seo_title_en: product.seoTitleEn ?? "",
    seo_title_bn: product.seoTitleBn ?? "",
    seo_description_en: product.seoDescriptionEn ?? "",
    seo_description_bn: product.seoDescriptionBn ?? "",
    status: product.status,
  };
  return product.variants.map((variant) => {
    const option = (type: "SIZE" | "COLOUR") => {
      for (const link of variant.optionValues) {
        const found = values.get(link.optionValueId);
        if (found?.type === type) return found.value.code ?? found.value.valueEn;
      }
      return "";
    };
    return {
      ...shared,
      size: option("SIZE"),
      colour: option("COLOUR"),
      sku: variant.sku,
      barcode: variant.barcode ?? "",
      price_tk: taka(variant.pricePoisha),
      compare_at_tk: taka(variant.comparePricePoisha),
      weight_g: variant.weightGrams === null ? "" : String(variant.weightGrams),
      ...(withCost ? { cost_tk: taka(variant.costPoisha) } : {}),
    };
  });
}

/** Every matching product, a page at a time, as export rows. */
export async function* productExportPages(
  staff: StaffContext,
  raw: Record<string, string | undefined>,
): AsyncGenerator<ExportRow[]> {
  assertPermission(staff, "catalog.export");
  const filter = filterFrom(raw);
  const withCost = hasPermission(staff, "inventory.cost.read");
  let after: string | null = null;
  for (;;) {
    const products = await findProductsForExport(filter, after, PAGE);
    if (products.length === 0) return;
    yield products.flatMap((product) => exportRows(product, withCost));
    if (products.length < PAGE) return;
    after = products[products.length - 1]!.id;
  }
}

export async function auditProductExport(
  staff: StaffContext,
  raw: Record<string, string | undefined>,
  meta: RequestMeta,
) {
  assertPermission(staff, "catalog.export");
  const query = productListQuerySchema.parse(raw);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.catalogExported,
    entityType: "product",
    after: {
      filters: {
        q: query.q ?? null,
        categoryId: query.categoryId ?? null,
        brandId: query.brandId ?? null,
        status: query.status ?? null,
      },
      withCost: hasPermission(staff, "inventory.cost.read"),
    },
    meta,
  });
}
