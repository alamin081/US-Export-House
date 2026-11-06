import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The Prisma client.
 *
 * ARCHITECTURE RULE: only `*.repository.ts` files may import this module (and
 * `eslint.config.mjs` enforces it). Pages, components, Server Actions and
 * integrations go through a service, which goes through a repository.
 *
 * Prisma 7 requires a driver adapter, so the connection is made by `pg`. In
 * development the client is cached on `globalThis` to survive hot reloads,
 * which otherwise opens a new pool on every edit.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
