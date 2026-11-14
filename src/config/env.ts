/**
 * Environment variable validation at startup.
 *
 * This module is imported from `next.config.ts`, so the application refuses to
 * start (dev, build and production start) whenever a required variable is
 * missing, malformed, or unsafe for the current environment. The rules
 * themselves live in env-rules.ts (pure and unit-tested).
 */
import {
  parseClientEnv,
  parseServerEnv,
  storageRootFolder,
  type ClientEnv,
  type ServerEnv,
} from "./env-rules";

/**
 * Server-only environment. Importing this from a Client Component throws
 * instead of leaking secrets into the browser bundle.
 */
export const env: ServerEnv = (() => {
  if (typeof window !== "undefined") {
    throw new Error("[env] `env` contains secrets and must not be imported in client code.");
  }
  return parseServerEnv(process.env);
})();

/** Safe to use in Client Components: only NEXT_PUBLIC_* values. */
export const clientEnv: ClientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
});

export const isProductionDeployment = env.APP_ENV === "production";
export const isLocalDevelopment = env.APP_ENV === "local";

/** This environment's upload folder: ueh/dev, ueh/staging or ueh/prod. */
export const storageFolder = storageRootFolder(env);
