/**
 * Stock CSV parser — pure, no database. Turns the text of an uploaded file
 * into merged stock lines plus row-numbered errors and warnings; the service
 * then resolves location codes and SKUs against the database.
 *
 * Format (header required, column order free, extra columns ignored):
 *
 *   location_code,sku,quantity,unit_cost_tk
 *   WH-01,UEH-FS0001-WHT-L,25,"1,250.50"
 *
 * What files saved from Excel look like, and what is accepted:
 *   - a UTF-8 byte order mark                       -> stripped
 *   - comma, semicolon or tab between columns       -> detected from the header
 *   - blank rows, spaces around values               -> ignored / trimmed
 *   - SKUs and location codes in any letter case     -> matched case-insensitively
 *   - Bengali digits (০-৯)                            -> read as 0-9
 *   - thousands separators inside quotes ("1,250")   -> accepted
 *   - "৳" or "Tk" in front of a cost                 -> ignored
 * An unquoted thousands comma in a comma-separated file splits the value into
 * two columns; that row gets a clear error instead of a wrong number.
 *
 * Rows for the same location and SKU are added together into one line, and
 * the line remembers which rows it came from.
 */

export const STOCK_CSV_COLUMNS = ["location_code", "sku", "quantity", "unit_cost_tk"] as const;
const REQUIRED_COLUMNS = ["location_code", "sku", "quantity"] as const;

export const STOCK_CSV_TEMPLATE =
  "location_code,sku,quantity,unit_cost_tk\r\n" +
  'WH-01,UEH-FS0001-WHT-L,25,"1,250.00"\r\n' +
  "WH-01,UEH-FS0001-WHT-XL,10,\r\n";

const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_COST_TAKA = 10_000_000;

export interface StockCsvLine {
  /** Upper-cased, trimmed. */
  locationCode: string;
  /** Trimmed, as typed (the database lookup ignores case). */
  sku: string;
  quantity: number;
  unitCostPoisha: number | null;
  /** File row numbers (header = row 1) that were added into this line. */
  rows: number[];
}

export interface StockCsvIssue {
  /** File row number, or null for a problem with the whole file. */
  row: number | null;
  message: string;
}

export interface StockCsvResult {
  delimiter: "," | ";" | "\t";
  lines: StockCsvLine[];
  errors: StockCsvIssue[];
  warnings: StockCsvIssue[];
  /** Non-blank data rows read from the file. */
  dataRows: number;
}

// ---------------------------------------------------------------------------
// low-level CSV reading
// ---------------------------------------------------------------------------

interface RawRecord {
  /** Row number where the record starts (1-based). */
  row: number;
  fields: string[];
}

/** Picks the delimiter that splits the header line most often. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "," || char === ";" || char === "\t")) counts[char] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/** RFC 4180 reading: quoted fields, doubled quotes, line breaks inside quotes. */
export function readCsvRecords(text: string, delimiter: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let row = 1;
  let recordRow = 1;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push({ row: recordRow, fields });
    fields = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") row += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\r" && text[index + 1] === "\n") {
      continue;
    } else if (char === "\n" || char === "\r") {
      endRecord();
      row += 1;
      recordRow = row;
    } else {
      field += char;
    }
  }
  if (field !== "" || fields.length > 0) endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// values
// ---------------------------------------------------------------------------

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

/** ০-৯ to 0-9. */
export function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));
}

/**
 * A plain number with optional thousands separators in correct groups
 * ("1,250", "12,50,000" in the South Asian style is also accepted) and an
 * optional decimal part. Returns null when the text is not such a number.
 */
export function parseDecimal(raw: string): number | null {
  const value = toLatinDigits(raw).trim();
  if (value === "") return null;
  const grouped = /^\d{1,3}(,\d{2,3})*(,\d{3})(\.\d+)?$/;
  const plain = /^\d+(\.\d+)?$/;
  if (!plain.test(value) && !grouped.test(value)) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(raw: string): { value: number } | { error: string } {
  const parsed = parseDecimal(raw);
  if (parsed === null) {
    return /^-/.test(raw.trim())
      ? { error: `Quantity "${raw.trim()}" is negative; use a stock adjustment to remove stock.` }
      : { error: `Quantity "${raw.trim()}" is not a number.` };
  }
  if (!Number.isInteger(parsed))
    return { error: `Quantity "${raw.trim()}" is not a whole number.` };
  if (parsed > MAX_QUANTITY) return { error: `Quantity ${parsed} is larger than ${MAX_QUANTITY}.` };
  return { value: parsed };
}

function parseUnitCost(raw: string): { value: number | null } | { error: string } {
  const cleaned = raw
    .trim()
    .replace(/^(৳|tk\.?|bdt)\s*/i, "")
    .trim();
  if (cleaned === "") return { value: null };
  const parsed = parseDecimal(cleaned);
  if (parsed === null) return { error: `Unit cost "${raw.trim()}" is not a number.` };
  if (parsed > MAX_UNIT_COST_TAKA) return { error: `Unit cost ${parsed} is too large.` };
  const poisha = Math.round(parsed * 100);
  if (Math.abs(parsed * 100 - poisha) > 1e-6) {
    return { error: `Unit cost "${raw.trim()}" has more than 2 decimal places.` };
  }
  return { value: poisha };
}

function headerName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// ---------------------------------------------------------------------------
// the parser
// ---------------------------------------------------------------------------

export function parseStockCsv(input: string, options: { maxRows: number }): StockCsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const result: StockCsvResult = { delimiter, lines: [], errors: [], warnings: [], dataRows: 0 };

  const records = readCsvRecords(text, delimiter).filter((record) =>
    record.fields.some((field) => field.trim() !== ""),
  );
  const header = records.shift();
  if (header === undefined) {
    result.errors.push({ row: null, message: "The file is empty." });
    return result;
  }

  const columns = header.fields.map(headerName);
  const indexOf = (name: string) => columns.indexOf(name);
  const missing = REQUIRED_COLUMNS.filter((name) => indexOf(name) === -1);
  if (missing.length > 0) {
    result.errors.push({
      row: header.row,
      message: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. The first row must be: ${STOCK_CSV_COLUMNS.join(",")}`,
    });
    return result;
  }

  result.dataRows = records.length;
  if (records.length === 0) {
    result.errors.push({ row: null, message: "The file has a header but no stock rows." });
    return result;
  }
  if (records.length > options.maxRows) {
    result.errors.push({
      row: null,
      message: `The file has ${records.length} rows; the limit is ${options.maxRows}. Split it into smaller files.`,
    });
    return result;
  }

  const costIndex = indexOf("unit_cost_tk");
  const merged = new Map<
    string,
    StockCsvLine & { costRows: number; costedQuantity: number; costSum: number }
  >();

  for (const record of records) {
    const { row, fields } = record;
    if (
      fields.length > columns.length &&
      fields.slice(columns.length).some((field) => field.trim() !== "")
    ) {
      result.errors.push({
        row,
        message:
          `Row has ${fields.length} values but the header has ${columns.length}. ` +
          (delimiter === ","
            ? 'A number with a thousands comma must be in quotes ("1,250") or written without the comma (1250).'
            : "Check for an extra separator in this row."),
      });
      continue;
    }
    const cell = (index: number) => (index === -1 ? "" : (fields[index] ?? "").trim());

    const locationCode = cell(indexOf("location_code")).toUpperCase();
    const sku = cell(indexOf("sku"));
    const rowErrors: string[] = [];
    if (locationCode === "") rowErrors.push("location_code is empty.");
    if (sku === "") rowErrors.push("sku is empty.");

    const quantityRaw = cell(indexOf("quantity"));
    const quantity = parseQuantity(quantityRaw);
    if ("error" in quantity) rowErrors.push(quantity.error);
    const cost = parseUnitCost(cell(costIndex));
    if ("error" in cost) rowErrors.push(cost.error);

    if (rowErrors.length > 0 || "error" in quantity || "error" in cost) {
      result.errors.push({ row, message: rowErrors.join(" ") });
      continue;
    }
    if (quantity.value === 0) {
      result.warnings.push({ row, message: `Quantity is 0 for ${sku}; row skipped.` });
      continue;
    }

    const key = `${locationCode}|${sku.toLowerCase()}`;
    const existing = merged.get(key);
    const costed = cost.value === null ? 0 : quantity.value;
    if (existing === undefined) {
      merged.set(key, {
        locationCode,
        sku,
        quantity: quantity.value,
        unitCostPoisha: cost.value,
        rows: [row],
        costRows: cost.value === null ? 0 : 1,
        costedQuantity: costed,
        costSum: (cost.value ?? 0) * quantity.value,
      });
    } else {
      existing.quantity += quantity.value;
      existing.rows.push(row);
      existing.costRows += cost.value === null ? 0 : 1;
      existing.costedQuantity += costed;
      existing.costSum += (cost.value ?? 0) * quantity.value;
    }
  }

  for (const line of merged.values()) {
    const { costRows, costedQuantity, costSum, ...clean } = line;
    if (line.rows.length > 1) {
      if (costRows !== 0 && costRows !== line.rows.length) {
        result.errors.push({
          row: line.rows[0] ?? null,
          message: `Rows ${line.rows.join(", ")} are the same item (${line.locationCode} / ${line.sku}) but only some have a unit cost. Give every row a cost, or none.`,
        });
        continue;
      }
      clean.unitCostPoisha = costRows === 0 ? null : Math.round(costSum / costedQuantity);
      result.warnings.push({
        row: line.rows[0] ?? null,
        message: `Rows ${line.rows.join(", ")} are the same item (${line.locationCode} / ${line.sku}) and were added together: ${line.quantity} in total.`,
      });
    }
    result.lines.push(clean);
  }
  return result;
}
