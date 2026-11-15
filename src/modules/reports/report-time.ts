/**
 * Report dates — pure, no database.
 *
 * Every report counts in Bangladesh time (Asia/Dhaka, UTC+6, no daylight
 * saving): a day starts at 00:00 in Dhaka, which is 18:00 UTC the day before.
 * Ranges are half-open, `[from, to)`, so a sale at exactly midnight belongs to
 * the new day. Dates travel as "YYYY-MM-DD" keys of the Dhaka calendar.
 */

export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest custom range a report accepts. */
export const MAX_RANGE_DAYS = 366;

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "last_30_days",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  custom: "Custom",
};

export type BucketUnit = "day" | "week" | "month";

export interface DateRange {
  preset: RangePreset;
  /** Inclusive start instant (Dhaka 00:00 of `fromKey`). */
  from: Date;
  /** Exclusive end instant (Dhaka 00:00 of the day after `toKey`). */
  to: Date;
  fromKey: string;
  /** Inclusive last day. */
  toKey: string;
}

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  const match = KEY_PATTERN.exec(value);
  if (match === null) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** The Dhaka calendar day an instant falls on. */
export function dhakaDateKey(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant of 00:00 in Dhaka on that day. */
export function dhakaMidnight(key: string): Date {
  if (!isDateKey(key)) throw new Error(`Not a date: ${key}`);
  return new Date(Date.parse(`${key}T00:00:00Z`) - DHAKA_OFFSET_MS);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both keys). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function weekday(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** First day of the week containing `key` (weekStartsOn: 0 = Sunday … 6 = Saturday). */
export function weekStart(key: string, weekStartsOn: number): string {
  const back = (weekday(key) - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function lastDayOfMonth(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function range(preset: RangePreset, fromKey: string, toKey: string): DateRange {
  return {
    preset,
    fromKey,
    toKey,
    from: dhakaMidnight(fromKey),
    to: dhakaMidnight(addDays(toKey, 1)),
  };
}

/**
 * Turns a preset (or a custom from/to) into instants. An invalid or too long
 * custom range falls back to "today" rather than failing the page.
 */
export function resolveRange(input: {
  preset: RangePreset;
  from?: string | null;
  to?: string | null;
  now: Date;
  weekStartsOn: number;
}): DateRange {
  const today = dhakaDateKey(input.now);
  switch (input.preset) {
    case "today":
      return range("today", today, today);
    case "yesterday": {
      const day = addDays(today, -1);
      return range("yesterday", day, day);
    }
    case "this_week":
      return range("this_week", weekStart(today, input.weekStartsOn), today);
    case "this_month":
      return range("this_month", monthStart(today), today);
    case "last_month": {
      const end = addDays(monthStart(today), -1);
      return range("last_month", monthStart(end), end);
    }
    case "last_30_days":
      return range("last_30_days", addDays(today, -29), today);
    case "custom": {
      const from = input.from ?? "";
      const to = input.to ?? "";
      if (!isDateKey(from) || !isDateKey(to)) return range("today", today, today);
      const [start, end] = from <= to ? [from, to] : [to, from];
      if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) return range("today", today, today);
      return range("custom", start, end);
    }
  }
}

/** The bucket a day belongs to, as the key of the bucket's first day. */
export function bucketOf(key: string, unit: BucketUnit, weekStartsOn: number): string {
  if (unit === "day") return key;
  if (unit === "week") return weekStart(key, weekStartsOn);
  return monthStart(key);
}

/** Last day of the bucket that starts on `key`. */
export function bucketLastDay(key: string, unit: BucketUnit): string {
  if (unit === "day") return key;
  if (unit === "week") return addDays(key, 6);
  return lastDayOfMonth(key);
}

/** Every bucket key from the range's first day to its last, in order. */
export function bucketsIn(range: DateRange, unit: BucketUnit, weekStartsOn: number): string[] {
  const keys: string[] = [];
  let cursor = bucketOf(range.fromKey, unit, weekStartsOn);
  while (cursor <= range.toKey) {
    keys.push(cursor);
    cursor = addDays(bucketLastDay(cursor, unit), 1);
  }
  return keys;
}

/** A sensible bucket for a range: days up to two months, then weeks, then months. */
export function defaultBucket(range: DateRange): BucketUnit {
  const days = daysBetween(range.fromKey, range.toKey) + 1;
  if (days <= 62) return "day";
  if (days <= 190) return "week";
  return "month";
}

/** Whole days elapsed since an instant, in Dhaka calendar days. */
export function ageInDays(since: Date, now: Date): number {
  return Math.max(0, daysBetween(dhakaDateKey(since), dhakaDateKey(now)));
}

/** "2026-11-15 14:05" in Dhaka time, for CSV files. */
export function formatDhakaDateTime(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}
