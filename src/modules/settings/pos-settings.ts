/**
 * Till (POS) and label settings (Phase 9), stored as `Setting` rows. The
 * values below are the fallbacks when a row is missing or malformed. Owner
 * decisions 2026-11-15: discount limits Branch Sales Staff 5%, Branch Manager
 * 15%, managers unlimited; one counter "MAIN" per location; 38×25 mm labels.
 */
import { z } from "zod";

export interface PosSettings {
  /** Largest discount (% of the bill) a role may give without a manager. Roles not listed: unlimited. */
  maxDiscountPercentByRole: Record<string, number>;
  /** Extra counters per location code; every location always has MAIN. */
  counters: Record<string, string[]>;
  receiptWidthMm: 58 | 80;
  labelWidthMm: number;
  labelHeightMm: number;
  /** Wrong manager PIN tries per manager per 15 minutes. */
  pinAttemptsPer15Min: number;
}

export const DEFAULT_POS_SETTINGS: PosSettings = {
  maxDiscountPercentByRole: { "Branch Sales Staff": 5, "Branch Manager": 15 },
  counters: {},
  receiptWidthMm: 80,
  labelWidthMm: 38,
  labelHeightMm: 25,
  pinAttemptsPer15Min: 5,
};

export const POS_SETTING_KEYS = {
  maxDiscountPercentByRole: "pos.maxDiscountPercentByRole",
  counters: "pos.counters",
  receiptWidthMm: "pos.receiptWidthMm",
  labelWidthMm: "labels.widthMm",
  labelHeightMm: "labels.heightMm",
  pinAttemptsPer15Min: "pos.pinAttemptsPer15Min",
} as const satisfies Record<keyof PosSettings, string>;

const json = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "not JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);

export const posSettingParsers = {
  maxDiscountPercentByRole: json(z.record(z.string(), z.number().min(0).max(100))),
  counters: json(z.record(z.string(), z.array(z.string().regex(/^[A-Z0-9-]{1,12}$/)).max(20))),
  receiptWidthMm: z.coerce.number().pipe(z.union([z.literal(58), z.literal(80)])),
  labelWidthMm: z.coerce.number().int().min(20).max(120),
  labelHeightMm: z.coerce.number().int().min(10).max(120),
  pinAttemptsPer15Min: z.coerce.number().int().min(1).max(100),
} satisfies Record<keyof PosSettings, z.ZodType>;

export function parsePosSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): PosSettings {
  const result: Record<string, unknown> = { ...DEFAULT_POS_SETTINGS };
  for (const field of Object.keys(posSettingParsers) as Array<keyof PosSettings>) {
    const value = raw.get(POS_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = posSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${POS_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as PosSettings;
}

/** Counters of a location: always MAIN, plus any configured. */
export function countersFor(settings: PosSettings, locationCode: string): string[] {
  return ["MAIN", ...(settings.counters[locationCode] ?? []).filter((code) => code !== "MAIN")];
}

/** The role's discount limit in percent, or null for unlimited. */
export function discountLimitFor(settings: PosSettings, roleName: string): number | null {
  return settings.maxDiscountPercentByRole[roleName] ?? null;
}
