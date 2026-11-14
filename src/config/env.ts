/**
 * Environment variable validation.
 *
 * This module is imported from `next.config.ts`, so the application refuses to
 * start (dev, build and production start) whenever a required variable is
 * missing, malformed, or unsafe for the current environment.
 *
 * Rules enforced here (see master spec sections 1, 3.3, 3.4, 8):
 *  - Secrets live only in server environment variables.
 *  - Development-only providers (DevSmsProvider, MockCourierProvider, mock
 *    image storage) can never be active in a production deployment.
 *  - A `live` integration mode must come with real credentials.
 */
import { z } from "zod";

/** Infrastructure-level Node environment (set by Next.js / the runtime). */
const nodeEnvSchema = z.enum(["development", "test", "production"]);

/**
 * Deployment target. Independent of NODE_ENV, because a staging deployment is a
 * production build that is still allowed to use sandbox credentials.
 */
const appEnvSchema = z.enum(["local", "staging", "production"]);

const serverSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  APP_ENV: appEnvSchema.default("local"),

  /** Public origin of the app, used for absolute URLs, SEO and webhooks. */
  APP_URL: z.url(),

  /** PostgreSQL connection string (Docker locally, Neon/Supabase in the cloud). */
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    }),
  /** Optional direct (non-pooled) connection, used by Prisma migrations later. */
  DATABASE_URL_UNPOOLED: z.string().optional(),

  /** Auth.js secret. Generate with: openssl rand -base64 32 */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  /** Staff are signed out after this many minutes without a request (default 8 hours). */
  STAFF_SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(30 * 24 * 60)
    .default(8 * 60),
  /** Absolute staff session lifetime in hours, however active (default 7 days). */
  STAFF_SESSION_MAX_AGE_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(90 * 24)
    .default(7 * 24),

  /** SMS/OTP delivery. `dev` only logs the OTP to the server console. */
  SMS_PROVIDER: z.enum(["dev", "bulksms_bd"]).default("dev"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),

  /** Payments. COD is always available; SSLCOMMERZ is switched per environment. */
  PAYMENT_SSLCOMMERZ_MODE: z.enum(["disabled", "sandbox", "live"]).default("disabled"),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),

  /** Courier. `mock` never contacts Steadfast and is badged "MOCK" in the admin UI. */
  COURIER_STEADFAST_MODE: z.enum(["mock", "sandbox", "live"]).default("mock"),
  STEADFAST_API_KEY: z.string().optional(),
  STEADFAST_SECRET_KEY: z.string().optional(),
  STEADFAST_BASE_URL: z.string().optional(),

  /**
   * Image storage: Cloudinary (decided 2026-11-14). `local` is the development
   * mock (files in public/uploads-dev/) and is refused when APP_ENV=production.
   */
  STORAGE_PROVIDER: z.enum(["local", "cloudinary"]).default("local"),
  CLOUDINARY_CLOUD_NAME: z
    .string()
    .regex(/^[a-z0-9_-]*$/i, "CLOUDINARY_CLOUD_NAME may only contain letters, digits, - and _")
    .optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /** Top-level Cloudinary folder, so several environments can share one account. */
  CLOUDINARY_FOLDER: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .default("ueh"),

  /** Shared secret for scheduled jobs (reservation release, courier polling). */
  CRON_SECRET: z.string().optional(),
});

const clientSchema = z.object({
  /** Mirrors APP_URL for client-side absolute links. */
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default("US Export House"),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => "  - " + (issue.path.join(".") || "(root)") + ": " + issue.message)
    .join("\n");
}

function fail(title: string, details: string): never {
  throw new Error(
    "\n[env] " +
      title +
      "\n" +
      details +
      "\n\nFix your .env.local file (see .env.example) and start again.\n",
  );
}

/**
 * Guards that depend on a combination of variables rather than a single field,
 * so they cannot be expressed in the Zod object schema alone.
 */
function assertSafeCombinations(parsedEnv: ServerEnv): void {
  const problems: string[] = [];
  const isProductionTarget = parsedEnv.APP_ENV === "production";

  // NOTE: the guard against the console OTP provider is keyed on APP_ENV, not
  // NODE_ENV, because `next build` always runs with NODE_ENV=production - even
  // on a developer machine - and a local production build must stay possible.
  // Phase 5 adds the second half of this guard where the provider is actually
  // selected: the DevSmsProvider factory refuses to run when
  // NODE_ENV=production, so it can never deliver an OTP in a live server.
  if (isProductionTarget) {
    if (parsedEnv.SMS_PROVIDER === "dev") {
      problems.push(
        "  - SMS_PROVIDER=dev only logs OTP codes to the console and is not allowed when APP_ENV=production",
      );
    }
    if (parsedEnv.COURIER_STEADFAST_MODE === "mock") {
      problems.push("  - COURIER_STEADFAST_MODE=mock is not allowed when APP_ENV=production");
    }
    if (parsedEnv.PAYMENT_SSLCOMMERZ_MODE === "sandbox") {
      problems.push("  - PAYMENT_SSLCOMMERZ_MODE=sandbox is not allowed when APP_ENV=production");
    }
    if (parsedEnv.STORAGE_PROVIDER === "local") {
      problems.push("  - STORAGE_PROVIDER=local is not allowed when APP_ENV=production");
    }
  }

  if (parsedEnv.STAFF_SESSION_IDLE_TIMEOUT_MINUTES > parsedEnv.STAFF_SESSION_MAX_AGE_HOURS * 60) {
    problems.push(
      "  - STAFF_SESSION_IDLE_TIMEOUT_MINUTES must not be longer than STAFF_SESSION_MAX_AGE_HOURS",
    );
  }

  if (parsedEnv.SMS_PROVIDER !== "dev" && !parsedEnv.SMS_API_KEY) {
    problems.push("  - SMS_PROVIDER=" + parsedEnv.SMS_PROVIDER + " requires SMS_API_KEY");
  }

  if (parsedEnv.PAYMENT_SSLCOMMERZ_MODE !== "disabled") {
    if (!parsedEnv.SSLCOMMERZ_STORE_ID || !parsedEnv.SSLCOMMERZ_STORE_PASSWORD) {
      problems.push(
        "  - PAYMENT_SSLCOMMERZ_MODE=" +
          parsedEnv.PAYMENT_SSLCOMMERZ_MODE +
          " requires SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD",
      );
    }
  }

  if (parsedEnv.COURIER_STEADFAST_MODE !== "mock") {
    if (!parsedEnv.STEADFAST_API_KEY || !parsedEnv.STEADFAST_SECRET_KEY) {
      problems.push(
        "  - COURIER_STEADFAST_MODE=" +
          parsedEnv.COURIER_STEADFAST_MODE +
          " requires STEADFAST_API_KEY and STEADFAST_SECRET_KEY",
      );
    }
  }

  if (parsedEnv.STORAGE_PROVIDER === "cloudinary") {
    if (
      !parsedEnv.CLOUDINARY_CLOUD_NAME ||
      !parsedEnv.CLOUDINARY_API_KEY ||
      !parsedEnv.CLOUDINARY_API_SECRET
    ) {
      problems.push(
        "  - STORAGE_PROVIDER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET",
      );
    }
  }

  if (problems.length > 0) {
    fail("Unsafe environment configuration:", problems.join("\n"));
  }
}

function loadServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    fail("Invalid or missing server environment variables:", formatIssues(parsed.error));
  }
  assertSafeCombinations(parsed.data);
  return parsed.data;
}

function loadClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  });
  if (!parsed.success) {
    fail("Invalid or missing NEXT_PUBLIC_* environment variables:", formatIssues(parsed.error));
  }
  return parsed.data;
}

/**
 * Server-only environment. Importing this from a Client Component throws
 * instead of leaking secrets into the browser bundle.
 */
export const env: ServerEnv = (() => {
  if (typeof window !== "undefined") {
    throw new Error("[env] `env` contains secrets and must not be imported in client code.");
  }
  return loadServerEnv();
})();

/** Safe to use in Client Components: only NEXT_PUBLIC_* values. */
export const clientEnv: ClientEnv = loadClientEnv();

export const isProductionDeployment = env.APP_ENV === "production";
export const isLocalDevelopment = env.APP_ENV === "local";
