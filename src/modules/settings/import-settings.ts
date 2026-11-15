/**
 * Product import and bulk image upload settings (Phase 12), stored as
 * `Setting` rows. The values below are the owner-approved defaults used when a
 * row is missing.
 */
import { z } from "zod";

export interface ImportSettings {
  /** Largest file accepted, in bytes. */
  maxBytes: number;
  /** Most data rows in one file. */
  maxRows: number;
  /** All-or-nothing applies in one request, so it has its own, smaller limit. */
  atomicMaxRows: number;
  /** Offer the "good products only" mode (applied in chunks). */
  allowPartial: boolean;
  /** Create a size/colour preset the file names but the library lacks. */
  createMissingOptions: boolean;
  /** Images uploaded at the same time on the bulk image page. */
  bulkConcurrency: number;
}

export const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 5000,
  atomicMaxRows: 1000,
  allowPartial: false,
  createMissingOptions: false,
  bulkConcurrency: 3,
};

export const IMPORT_SETTING_KEYS = {
  maxBytes: "catalog.import.maxBytes",
  maxRows: "catalog.import.maxRows",
  atomicMaxRows: "catalog.import.atomicMaxRows",
  allowPartial: "catalog.import.allowPartial",
  createMissingOptions: "catalog.import.createMissingOptions",
  bulkConcurrency: "media.bulkConcurrency",
} as const satisfies Record<keyof ImportSettings, string>;

const bool = z.enum(["true", "false"]).transform((value) => value === "true");

export const importSettingParsers = {
  maxBytes: z.coerce
    .number()
    .int()
    .min(10 * 1024)
    .max(10 * 1024 * 1024),
  maxRows: z.coerce.number().int().min(10).max(20000),
  atomicMaxRows: z.coerce.number().int().min(10).max(5000),
  allowPartial: bool,
  createMissingOptions: bool,
  bulkConcurrency: z.coerce.number().int().min(1).max(6),
} satisfies Record<keyof ImportSettings, z.ZodType>;

export function parseImportSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): ImportSettings {
  const result: Record<string, unknown> = { ...DEFAULT_IMPORT_SETTINGS };
  for (const field of Object.keys(importSettingParsers) as Array<keyof ImportSettings>) {
    const value = raw.get(IMPORT_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = importSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${IMPORT_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as ImportSettings;
}
