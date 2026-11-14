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
