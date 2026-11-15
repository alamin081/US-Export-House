import "server-only";

import { db } from "@/lib/db";

/** Raw `Setting` rows for a set of keys. */
export async function findSettingValues(keys: readonly string[]): Promise<Map<string, string>> {
  const rows = await db.setting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((row) => [row.key, row.value]));
}

export interface SettingWrite {
  key: string;
  value: string;
  valueType: "STRING" | "INT" | "BOOLEAN" | "JSON";
  group: string;
  labelEn: string;
}

/** Writes several settings in one transaction (insert or update by key). */
export async function upsertSettingRows(rows: readonly SettingWrite[], userId: string) {
  await db.$transaction(
    rows.map((row) =>
      db.setting.upsert({
        where: { key: row.key },
        create: { ...row, updatedByUserId: userId },
        update: { value: row.value, valueType: row.valueType, updatedByUserId: userId },
      }),
    ),
  );
}

export async function findSettingRows(keys: readonly string[]) {
  return db.setting.findMany({
    where: { key: { in: [...keys] } },
    select: {
      key: true,
      value: true,
      updatedAt: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
}
