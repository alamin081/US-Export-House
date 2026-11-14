import { config as loadEnvFiles } from "dotenv";

/**
 * The database the E2E server and fixtures use: TEST_DATABASE_URL, or
 * DATABASE_URL with "_test" appended. Anything whose name does not end in
 * "_test" is refused, exactly like the integration suite.
 */
export function e2eDatabaseUrl(): string {
  loadEnvFiles({ path: [".env.local", ".env"], quiet: true });
  const explicit = process.env.TEST_DATABASE_URL;
  const base = explicit !== undefined && explicit !== "" ? explicit : process.env.DATABASE_URL;
  if (base === undefined || base === "") throw new Error("[e2e] DATABASE_URL is not set.");

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  if (!url.pathname.endsWith("_test")) {
    throw new Error(
      `[e2e] Refusing to run against "${url.pathname}". The name must end in "_test".`,
    );
  }
  return url.toString();
}
