import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration tests: real PostgreSQL, real Argon2, real services.
 *
 * They run ONLY against a database whose name ends in `_test` (see
 * tests/integration/setup.ts), never against the development database.
 * Files run one at a time because they share that database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server Components bundle; in
      // tests the modules are imported directly, which is fine.
      "server-only": fileURLToPath(
        new URL("./tests/integration/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
