/**
 * Which database `npm run db:seed:staging` may write to — pure, so the rules
 * are unit-tested. The answer is "only the confirmed staging database":
 *
 *   - APP_ENV must be exactly `staging` (production and local are refused);
 *   - the connection is the DIRECT one (DATABASE_URL_UNPOOLED, no "-pooler"),
 *     on the pinned Neon endpoint, database and TLS;
 *   - once connected, the server itself must report the pinned Neon project
 *     and branch (checked again inside the write transaction).
 *
 * The identifiers below are not secrets. If staging ever moves to another
 * Neon project or branch, change them here on purpose, in a reviewed commit.
 */

export const STAGING_DATABASE = {
  neonProjectId: "green-pine-97759922",
  neonBranchId: "br-weathered-bird-azlwursc",
  neonEndpointId: "ep-odd-breeze-az6novp4",
  database: "neondb",
} as const;

const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

export type StagingTarget =
  | {
      ok: true;
      /** The direct connection string (never printed). */
      connectionString: string;
      /** host/database, without credentials, for messages. */
      label: string;
    }
  | { ok: false; reason: string };

/** Checks the environment before any connection is opened. */
export function checkStagingTarget(env: Record<string, string | undefined>): StagingTarget {
  if (env.APP_ENV !== "staging") {
    return {
      ok: false,
      reason: `APP_ENV must be "staging" (got "${env.APP_ENV ?? ""}"). Run with --env-file=.env.staging.`,
    };
  }
  const raw = env.DATABASE_URL_UNPOOLED?.trim();
  if (raw === undefined || raw === "") {
    return { ok: false, reason: "DATABASE_URL_UNPOOLED (direct connection) is not set." };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "DATABASE_URL_UNPOOLED is not a valid URL." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, reason: `DATABASE_URL_UNPOOLED is not a postgres URL (${url.protocol}).` };
  }
  if (url.hostname.includes("-pooler.")) {
    return {
      ok: false,
      reason: "DATABASE_URL_UNPOOLED points at the pooler; use the direct host.",
    };
  }
  if (!url.hostname.startsWith(`${STAGING_DATABASE.neonEndpointId}.`)) {
    return {
      ok: false,
      reason: `Host ${url.hostname} is not the staging endpoint ${STAGING_DATABASE.neonEndpointId}.`,
    };
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (name !== STAGING_DATABASE.database) {
    return { ok: false, reason: `Database "${name}" is not "${STAGING_DATABASE.database}".` };
  }
  if (!SECURE_SSL_MODES.has(url.searchParams.get("sslmode") ?? "")) {
    return { ok: false, reason: "DATABASE_URL_UNPOOLED must include sslmode=require." };
  }
  return { ok: true, connectionString: raw, label: `${url.hostname}/${name}` };
}

export interface ServerIdentity {
  projectId: string | null;
  branchId: string | null;
  database: string | null;
}

/** Checks what the connected server reports about itself. */
export function checkServerIdentity(identity: ServerIdentity): string | null {
  if (identity.projectId !== STAGING_DATABASE.neonProjectId) {
    return `Connected Neon project is "${identity.projectId ?? "unknown"}", not ${STAGING_DATABASE.neonProjectId}.`;
  }
  if (identity.branchId !== STAGING_DATABASE.neonBranchId) {
    return `Connected Neon branch is "${identity.branchId ?? "unknown"}", not ${STAGING_DATABASE.neonBranchId}.`;
  }
  if (identity.database !== STAGING_DATABASE.database) {
    return `Connected database is "${identity.database ?? "unknown"}", not ${STAGING_DATABASE.database}.`;
  }
  return null;
}
