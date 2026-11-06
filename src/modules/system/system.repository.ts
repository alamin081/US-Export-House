import "server-only";

import { db } from "@/lib/db";

/**
 * Data access for infrastructure checks. The only file besides a domain
 * repository that is allowed to touch the Prisma client.
 */

/** Cheapest possible round trip, used by the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Applied migrations, newest first. Reported by the health endpoint. */
export async function findLatestMigration(): Promise<{ name: string; appliedAt: Date } | null> {
  try {
    const rows = await db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `;

    const row = rows[0];
    if (row === undefined || row.finished_at === null) return null;
    return { name: row.migration_name, appliedAt: row.finished_at };
  } catch {
    return null;
  }
}
