import { config as loadEnvFiles } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 moved the connection string, the migrations directory and the seed
 * command out of schema.prisma and package.json into this file, and it no
 * longer loads `.env` by itself — hence the explicit dotenv call below.
 *
 * Only the CLI reads this file. The application builds its own client in
 * src/lib/db.ts from the Zod-validated `env` module.
 */
loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

/**
 * Migrations must not run through a connection pooler. Neon and Supabase both
 * expose a direct (non-pooled) URL for this; locally the two are the same, so
 * DATABASE_URL_UNPOOLED is optional.
 */
const migrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

if (migrationUrl === undefined || migrationUrl === "") {
  throw new Error(
    "[prisma] DATABASE_URL is not set. Copy .env.example to .env.local and start the database with `npm run db:up`.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
