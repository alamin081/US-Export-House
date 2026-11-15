/**
 * Which database `npm run db:test:reset` may drop — pure, so the rules are
 * unit-tested. The answer is "only the local test database":
 *
 *   - the name must be exactly `us_export_house_test` (ends in `_test`, and is
 *     this project's — another project's `*_test` database is not ours);
 *   - the host must be `localhost` or `127.0.0.1` (never a cloud database);
 *   - the URL must be a plain postgres URL.
 *
 * The target comes from TEST_DATABASE_URL, or DATABASE_URL with `_test`
 * appended to the database name — the same rule the integration tests use.
 */

export const TEST_DATABASE_NAME = "us_export_house_test";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const explicit = env.TEST_DATABASE_URL?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const base = env.DATABASE_URL?.trim();
  if (base === undefined || base === "") throw new Error("DATABASE_URL is not set.");
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  return url.toString();
}

export type ResetTarget =
  | {
      ok: true;
      name: string;
      /** host:port/name, without the password, for messages. */
      label: string;
      /** The same server's `postgres` database, used to drop and create. */
      maintenanceUrl: string;
    }
  | { ok: false; reason: string };

export function checkResetTarget(rawUrl: string): ResetTarget {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "The test database URL is not a valid URL." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, reason: `Not a postgres URL (${url.protocol}).` };
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    return { ok: false, reason: `"${name}" does not end in _test.` };
  }
  if (name !== TEST_DATABASE_NAME) {
    return {
      ok: false,
      reason: `"${name}" is not this project's test database (${TEST_DATABASE_NAME}).`,
    };
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      reason: `Host "${url.hostname}" is not localhost or 127.0.0.1; only a local database is reset.`,
    };
  }
  const maintenance = new URL(url.toString());
  maintenance.pathname = "/postgres";
  maintenance.search = "";
  return {
    ok: true,
    name,
    label: `${url.hostname}:${url.port || "5432"}/${name}`,
    maintenanceUrl: maintenance.toString(),
  };
}

/** The only statements the reset sends to the server. */
export function resetStatements(name: string): string[] {
  if (name !== TEST_DATABASE_NAME) throw new Error(`Refusing to reset ${name}.`);
  return [`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`, `CREATE DATABASE "${name}"`];
}
