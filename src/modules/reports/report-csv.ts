/**
 * CSV for reports and exports — pure apart from the streaming helper.
 *
 * Files open correctly in Excel with Bengali text: UTF-8 with a byte order
 * mark, CRLF line ends, every field quoted when needed. Money is written in
 * taka with two decimals, dates in Dhaka time. A cell that starts with = + - @
 * (or a tab / carriage return) is prefixed with an apostrophe so a spreadsheet
 * never runs it as a formula (CSV injection).
 */
import { formatDhakaDateTime } from "./report-time";

export const CSV_BOM = "﻿";

export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumnKind = "text" | "int" | "money" | "percent" | "datetime" | "date";

export interface CsvColumn<Row> {
  header: string;
  kind: CsvColumnKind;
  value: (row: Row) => CsvValue;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Taka with two decimals, no thousands separator: 125050 -> "1250.50". */
export function poishaToTaka(poisha: number): string {
  const sign = poisha < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(poisha));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function cellText(value: CsvValue, kind: CsvColumnKind): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    return kind === "date" ? formatDhakaDateTime(value).slice(0, 10) : formatDhakaDateTime(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (kind === "money") return poishaToTaka(value);
    if (kind === "percent") return value.toFixed(1);
    return String(Math.trunc(value) === value ? value : Number(value.toFixed(4)));
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

/** One field, escaped and protected against formula injection. */
export function csvField(value: CsvValue, kind: CsvColumnKind = "text"): string {
  let text = cellText(value, kind);
  // Numbers we format ourselves may start with "-"; free text may not.
  const isOwnNumber = typeof value === "number" && kind !== "text";
  if (!isOwnNumber && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: readonly string[]): string {
  return `${values.join(",")}\r\n`;
}

export function csvHeader<Row>(columns: readonly CsvColumn<Row>[]): string {
  return csvLine(columns.map((column) => csvField(column.header)));
}

export function csvRow<Row>(columns: readonly CsvColumn<Row>[], row: Row): string {
  return csvLine(columns.map((column) => csvField(column.value(row), column.kind)));
}

/** Whole document in memory: small, already aggregated reports only. */
export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[]): string {
  return CSV_BOM + csvHeader(columns) + rows.map((row) => csvRow(columns, row)).join("");
}

/**
 * Streams rows as they are produced (an async generator reading the database
 * page by page), so a large export never sits in memory as a whole.
 */
export function csvStream<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: AsyncIterable<readonly Row[]>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.asyncIterator]();
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(CSV_BOM + csvHeader(columns)));
        return;
      }
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value.map((row) => csvRow(columns, row)).join("")));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** A safe file name: letters, digits, dash and underscore. */
export function csvFileName(base: string, fromKey: string, toKey: string): string {
  const safe = base.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  return fromKey === toKey ? `${safe}_${fromKey}.csv` : `${safe}_${fromKey}_to_${toKey}.csv`;
}
