/**
 * Dashboard and report settings (Phase 12), stored as `Setting` rows. The
 * values below are the owner-approved defaults used when a row is missing.
 */
import { z } from "zod";

export interface ReportSettings {
  /** First day of a report week: 0 = Sunday … 6 = Saturday (Bangladesh: Saturday). */
  weekStartsOn: number;
  /** Dashboard task: shipped but not delivered for more than this many days. */
  staleShipmentDays: number;
  /** Dashboard task: delivered COD not yet collected for more than this many days. */
  codOverdueDays: number;
  /** Storefront "best sellers" look back this many days. */
  bestSellerDays: number;
  /** Default look-back of the slow-stock report. */
  slowStockDays: number;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  weekStartsOn: 6,
  staleShipmentDays: 5,
  codOverdueDays: 7,
  bestSellerDays: 30,
  slowStockDays: 90,
};

export const REPORT_SETTING_KEYS = {
  weekStartsOn: "reports.weekStartsOn",
  staleShipmentDays: "dashboard.staleShipmentDays",
  codOverdueDays: "dashboard.codOverdueDays",
  bestSellerDays: "reports.bestSellerDays",
  slowStockDays: "reports.slowStockDays",
} as const satisfies Record<keyof ReportSettings, string>;

export const reportSettingParsers = {
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  staleShipmentDays: z.coerce.number().int().min(1).max(90),
  codOverdueDays: z.coerce.number().int().min(1).max(180),
  bestSellerDays: z.coerce.number().int().min(1).max(365),
  slowStockDays: z.coerce.number().int().min(7).max(730),
} satisfies Record<keyof ReportSettings, z.ZodType>;

export function parseReportSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): ReportSettings {
  const result: Record<string, unknown> = { ...DEFAULT_REPORT_SETTINGS };
  for (const field of Object.keys(reportSettingParsers) as Array<keyof ReportSettings>) {
    const value = raw.get(REPORT_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = reportSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${REPORT_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as ReportSettings;
}
