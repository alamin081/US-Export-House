/**
 * Product import sheet — pure, no database. Turns the cells of a CSV or the
 * first Excel sheet into rows keyed by column, groups them into products and
 * reports problems with their file row numbers. The service then resolves
 * codes against the database and plans the changes.
 *
 * One row per variant; product-level cells may repeat on every row (the
 * export does) or be filled on the first row only, but they may not differ.
 * Messages are Bengali: they are read by the staff who prepare the sheets.
 */
import { parseTakaInput } from "@/lib/money";
import { detectDelimiter, readCsvRecords, toLatinDigits } from "@/modules/inventory/stock-csv";

export type ColumnLevel = "product" | "variant";

export interface ImportColumn {
  key: string;
  level: ColumnLevel;
  /** Required for a new product. */
  requiredForNew: boolean;
  /** "[clear]" may empty it on an update. */
  clearable: boolean;
  maxLength?: number;
  en: string;
  bn: string;
  example: string;
}

const C = (
  key: string,
  level: ColumnLevel,
  en: string,
  bn: string,
  example: string,
  extra: Partial<Pick<ImportColumn, "requiredForNew" | "clearable" | "maxLength">> = {},
): ImportColumn => ({
  key,
  level,
  requiredForNew: extra.requiredForNew ?? false,
  clearable: extra.clearable ?? false,
  ...(extra.maxLength === undefined ? {} : { maxLength: extra.maxLength }),
  en,
  bn,
  example,
});

/** Every column, in the order the template and the export use. */
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  C(
    "product_code",
    "product",
    "Product code. Empty for a new product: one is made from the category.",
    "প্রোডাক্ট কোড। নতুন প্রোডাক্টে ফাঁকা রাখুন — ক্যাটাগরি থেকে তৈরি হবে।",
    "UEH-SH-00012",
  ),
  C("name_en", "product", "Name in English.", "ইংরেজি নাম।", "Oxford cotton shirt", {
    requiredForNew: true,
    maxLength: 150,
  }),
  C("name_bn", "product", "Name in Bengali.", "বাংলা নাম।", "অক্সফোর্ড কটন শার্ট", {
    clearable: true,
    maxLength: 150,
  }),
  C(
    "description_en",
    "product",
    "Description. A blank line starts a new paragraph. No HTML.",
    "বর্ণনা। ফাঁকা লাইন = নতুন অনুচ্ছেদ। HTML চলবে না।",
    "Soft Oxford weave.",
    { clearable: true, maxLength: 5000 },
  ),
  C(
    "description_bn",
    "product",
    "Description in Bengali.",
    "বাংলা বর্ণনা।",
    "নরম অক্সফোর্ড বুনন।",
    {
      clearable: true,
      maxLength: 5000,
    },
  ),
  C(
    "category_code",
    "product",
    "Main category code (see the list below).",
    "মূল ক্যাটাগরির কোড (নিচের তালিকা দেখুন)।",
    "SH",
    { requiredForNew: true },
  ),
  C(
    "extra_category_codes",
    "product",
    "More category codes, separated by ;",
    "আরও ক্যাটাগরির কোড, ; দিয়ে আলাদা।",
    "NEW;SALE",
    { clearable: true },
  ),
  C(
    "brand",
    "product",
    "Brand name or slug. Must already exist.",
    "ব্র্যান্ডের নাম বা slug — আগে থেকেই থাকতে হবে।",
    "US Export House",
    { clearable: true },
  ),
  C("fabric_en", "product", "Fabric.", "কাপড়।", "100% cotton", {
    clearable: true,
    maxLength: 200,
  }),
  C("fabric_bn", "product", "Fabric in Bengali.", "কাপড় (বাংলা)।", "১০০% কটন", {
    clearable: true,
    maxLength: 200,
  }),
  C("fit", "product", "Fit key or name.", "ফিটের key বা নাম।", "regular", { clearable: true }),
  C(
    "care_en",
    "product",
    "Care, one instruction per line.",
    "যত্ন, প্রতি লাইনে একটা।",
    "Machine wash cold",
    {
      clearable: true,
      maxLength: 1000,
    },
  ),
  C("care_bn", "product", "Care in Bengali.", "যত্ন (বাংলা)।", "ঠান্ডা পানিতে ধোয়া", {
    clearable: true,
    maxLength: 1000,
  }),
  C(
    "tags",
    "product",
    "Tags, separated by ; — unknown tags are created.",
    "ট্যাগ, ; দিয়ে আলাদা — অজানা ট্যাগ তৈরি হবে।",
    "summer;office",
    { clearable: true },
  ),
  C("size_chart", "product", "Size chart name.", "সাইজ চার্টের নাম।", "Shirts", {
    clearable: true,
  }),
  C("seo_title_en", "product", "Search title.", "সার্চের শিরোনাম।", "", {
    clearable: true,
    maxLength: 70,
  }),
  C("seo_title_bn", "product", "Search title in Bengali.", "সার্চের শিরোনাম (বাংলা)।", "", {
    clearable: true,
    maxLength: 70,
  }),
  C("seo_description_en", "product", "Search description.", "সার্চের বর্ণনা।", "", {
    clearable: true,
    maxLength: 160,
  }),
  C(
    "seo_description_bn",
    "product",
    "Search description in Bengali.",
    "সার্চের বর্ণনা (বাংলা)।",
    "",
    {
      clearable: true,
      maxLength: 160,
    },
  ),
  C(
    "status",
    "product",
    "DRAFT or PUBLISHED. Empty: a new product is a draft, an existing one keeps its status.",
    "DRAFT বা PUBLISHED। ফাঁকা: নতুন প্রোডাক্ট draft, পুরনোটা যেমন আছে।",
    "DRAFT",
  ),
  C("size", "variant", "Size code or name.", "সাইজের কোড বা নাম।", "M"),
  C("colour", "variant", "Colour code or name.", "রঙের কোড বা নাম।", "WHT"),
  C(
    "sku",
    "variant",
    "SKU. Empty for a new variant: made from the SKU pattern.",
    "SKU। নতুন ভ্যারিয়েন্টে ফাঁকা রাখুন — নিজে তৈরি হবে।",
    "",
  ),
  C(
    "barcode",
    "variant",
    "EAN-13 barcode. Empty for a new variant: the shop's own is made.",
    "EAN-13 বারকোড। নতুন ভ্যারিয়েন্টে ফাঁকা রাখুন — নিজে তৈরি হবে।",
    "",
  ),
  C("price_tk", "variant", "Price in taka.", "দাম (টাকা)।", "1,250", { requiredForNew: true }),
  C(
    "compare_at_tk",
    "variant",
    "Price before the sale, higher than the price.",
    "ছাড়ের আগের দাম, দামের চেয়ে বেশি।",
    "1,500",
    { clearable: true },
  ),
  C("weight_g", "variant", "Weight in grams.", "ওজন (গ্রাম)।", "250", { clearable: true }),
  C(
    "cost_tk",
    "variant",
    "Purchase cost in taka. Only for staff who may see costs.",
    "ক্রয়মূল্য (টাকা)। শুধু যাদের ক্রয়মূল্য দেখার অনুমতি আছে।",
    "",
  ),
];

export type ColumnKey = string;
const COLUMN_BY_KEY = new Map(IMPORT_COLUMNS.map((column) => [column.key, column]));
export const PRODUCT_COLUMNS = IMPORT_COLUMNS.filter((column) => column.level === "product").map(
  (column) => column.key,
);

const ALIASES: Record<string, string> = {
  color: "colour",
  code: "product_code",
  compare_at_price_tk: "compare_at_tk",
  weight_grams: "weight_g",
};

/** Typed in a cell to empty an optional text field on an update. */
export const CLEAR_TOKEN = "[clear]";
/** Rows of the template's examples start with this, and are refused. */
export const EXAMPLE_PREFIX = "EXAMPLE-";

export interface ImportIssue {
  /** File row number (heading = 1), or null for the whole file. */
  row: number | null;
  column: string | null;
  message: string;
}

export interface SheetRow {
  row: number;
  /** Trimmed cells by column key (known columns only). */
  cells: Record<ColumnKey, string>;
  /** The row as the file had it, for the error CSV. */
  source: string[];
}

export interface ParsedSheet {
  headers: string[];
  columns: ColumnKey[];
  rows: SheetRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export function headerKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ALIASES[key] ?? key;
}

/** CSV text to a table, with the file row number of each record. */
export function tableFromCsv(input: string): { table: string[][]; rowNumbers: number[] } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = readCsvRecords(text, detectDelimiter(text));
  return { table: records.map((record) => record.fields), rowNumbers: records.map((r) => r.row) };
}

/** Cells to rows keyed by column, with the checks that need no database. */
export function readProductSheet(
  table: readonly string[][],
  rowNumbers: readonly number[],
  options: { maxRows: number },
): ParsedSheet {
  const result: ParsedSheet = { headers: [], columns: [], rows: [], errors: [], warnings: [] };
  const headerIndex = table.findIndex((cells) => cells.some((cell) => cell.trim() !== ""));
  if (headerIndex === -1) {
    result.errors.push({ row: null, column: null, message: "ফাইলটা খালি।" });
    return result;
  }
  result.headers = (table[headerIndex] ?? []).map((cell) => cell.trim());
  const keys = result.headers.map(headerKey);
  const seen = new Set<string>();
  keys.forEach((key, index) => {
    if (key === "") return;
    if (!COLUMN_BY_KEY.has(key)) {
      result.warnings.push({
        row: null,
        column: result.headers[index] ?? key,
        message: `অজানা কলাম "${result.headers[index]}" উপেক্ষা করা হবে।`,
      });
    } else if (seen.has(key)) {
      result.errors.push({ row: null, column: key, message: `কলাম "${key}" দুবার আছে।` });
    }
    seen.add(key);
  });
  result.columns = IMPORT_COLUMNS.map((column) => column.key).filter((key) => seen.has(key));
  if (!seen.has("product_code") && !seen.has("sku") && !seen.has("name_en")) {
    result.errors.push({
      row: null,
      column: null,
      message: "product_code, sku বা name_en — অন্তত একটা কলাম লাগবে।",
    });
  }

  for (let index = headerIndex + 1; index < table.length; index += 1) {
    const source = table[index] ?? [];
    if (source.every((cell) => cell.trim() === "")) continue;
    const row = rowNumbers[index] ?? index + 1;
    if (result.rows.length >= options.maxRows) {
      result.errors.push({
        row: null,
        column: null,
        message: `ফাইলে ${options.maxRows}টার বেশি সারি। ফাইল ভাগ করুন।`,
      });
      break;
    }
    if (source.length > keys.length && source.slice(keys.length).some((cell) => cell.trim())) {
      result.errors.push({
        row,
        column: null,
        message:
          'এই সারিতে শিরোনামের চেয়ে বেশি ঘর। টাকার কমা থাকলে ঘরটা উদ্ধৃতি চিহ্নে রাখুন ("1,250")।',
      });
    }
    const cells: Record<string, string> = {};
    keys.forEach((key, column) => {
      if (COLUMN_BY_KEY.has(key) && cells[key] === undefined) {
        cells[key] = (source[column] ?? "").replace(/\r\n?/g, "\n").trim();
      }
    });
    result.rows.push({ row, cells, source: [...source] });
  }
  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push({ row: null, column: null, message: "শিরোনামের নিচে কোনো সারি নেই।" });
  }
  return result;
}

// ---------------------------------------------------------------------------
// grouping rows into products
// ---------------------------------------------------------------------------

export interface ProductGroup {
  /** Upper-cased product code, or a key for a new product. */
  key: string;
  code: string | null;
  rows: SheetRow[];
  /** Product-level cells: the first non-empty value of each column. */
  product: Record<ColumnKey, string>;
  errors: ImportIssue[];
}

/**
 * Rows of the same product code belong together; rows without a code join
 * the product of their SKU (when it exists) or, for a new product, the rows
 * with the same English name and category. `ownerBySku` maps a lower-cased
 * SKU to its product's code, or to "#<id>" for an older product without one.
 */
export function groupProducts(
  rows: readonly SheetRow[],
  ownerBySku: ReadonlyMap<string, string>,
): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const row of rows) {
    const typedCode = (row.cells.product_code ?? "").toUpperCase();
    const skuCode = ownerBySku.get((row.cells.sku ?? "").toLowerCase());
    const code = typedCode !== "" ? typedCode : (skuCode ?? null);
    const name = (row.cells.name_en ?? "").toLowerCase().replace(/\s+/g, " ");
    const key =
      code !== null
        ? code
        : name !== ""
          ? `new:${name}|${(row.cells.category_code ?? "").toUpperCase()}`
          : `row:${row.row}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, code, rows: [], product: {}, errors: [] };
      groups.set(key, group);
      if (code === null && name === "") {
        group.errors.push({
          row: row.row,
          column: null,
          message: "product_code, বিদ্যমান sku বা name_en — কোনোটাই নেই।",
        });
      }
    }
    group.rows.push(row);
    for (const column of PRODUCT_COLUMNS) {
      const value = row.cells[column] ?? "";
      if (value === "") continue;
      const first = group.product[column];
      if (first === undefined) group.product[column] = value;
      else if (first !== value) {
        group.errors.push({
          row: row.row,
          column,
          message: `${column}: আগের সারিতে "${clip(first)}", এখানে "${clip(value)}" — একই প্রোডাক্টে একই মান লিখুন।`,
        });
      }
    }
  }
  return [...groups.values()];
}

function clip(value: string): string {
  return value.length > 30 ? `${value.slice(0, 29)}…` : value;
}

// ---------------------------------------------------------------------------
// cell values
// ---------------------------------------------------------------------------

export function isClear(value: string): boolean {
  return value.trim().toLowerCase() === CLEAR_TOKEN;
}

export function hasHtml(value: string): boolean {
  return /<\s*\/?\s*[a-z!][^>]*>/i.test(value);
}

/** Taka to poisha: "1,250.50", "১২৫০", "৳ 1250", "Tk 1250". */
export function parseMoneyCell(raw: string): { value: number } | { error: string } {
  const cleaned = raw
    .trim()
    .replace(/^(৳|tk\.?|bdt)\s*/i, "")
    .trim();
  const poisha = parseTakaInput(cleaned);
  if (poisha === null) return { error: `"${raw}" টাকার সঠিক অঙ্ক নয় (যেমন 1250 বা 1,250.50)।` };
  return { value: poisha };
}

export function parseWholeNumber(raw: string, max: number): { value: number } | { error: string } {
  const text = toLatinDigits(raw.trim()).replace(/,/g, "");
  if (!/^\d+$/.test(text)) return { error: `"${raw}" পূর্ণসংখ্যা নয়।` };
  const value = Number(text);
  if (value > max) return { error: `${value} অনেক বড় (সর্বোচ্চ ${max})।` };
  return { value };
}

export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function columnInfo(key: string): ImportColumn | undefined {
  return COLUMN_BY_KEY.get(key);
}
