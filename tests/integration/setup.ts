/**
 * Integration test environment.
 *
 * Points DATABASE_URL at the test database before any application module is
 * imported, and refuses to continue unless that database's name ends in
 * `_test`. This is what guarantees the suite can never write to the
 * development or production database.
 *
 *   TEST_DATABASE_URL  explicit test database (CI sets DATABASE_URL directly)
 *   otherwise          DATABASE_URL with "_test" appended to the database name
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit !== undefined && explicit !== "") return explicit;

  const base = process.env.DATABASE_URL;
  if (base === undefined || base === "") {
    throw new Error("[integration] DATABASE_URL is not set.");
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  return url.toString();
}

const url = testDatabaseUrl();
const databaseName = new URL(url).pathname.replace(/^\//, "");

if (!databaseName.endsWith("_test")) {
  throw new Error(
    `[integration] Refusing to run against "${databaseName}". The database name must end in "_test".`,
  );
}

process.env.DATABASE_URL = url;
process.env.DATABASE_URL_UNPOOLED = "";
