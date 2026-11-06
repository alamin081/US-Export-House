import { env } from "@/config/env";
import { findLatestMigration, pingDatabase } from "./system.repository";

/**
 * System health, for uptime monitoring and deployment smoke tests.
 *
 * It reports which integration modes are live, so a staging or production
 * deployment can never quietly run on mock providers, and no secret value is
 * ever included — only mode names.
 */
export interface SystemHealth {
  status: "ok" | "degraded";
  appEnv: string;
  timestamp: string;
  database: {
    reachable: boolean;
    migration: string | null;
    migrationAppliedAt: string | null;
  };
  integrations: {
    sms: string;
    sslcommerz: string;
    steadfast: string;
    storage: string;
    mockStorefrontData: boolean;
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const [reachable, migration] = await Promise.all([pingDatabase(), findLatestMigration()]);

  return {
    status: reachable ? "ok" : "degraded",
    appEnv: env.APP_ENV,
    timestamp: new Date().toISOString(),
    database: {
      reachable,
      migration: migration?.name ?? null,
      migrationAppliedAt: migration?.appliedAt.toISOString() ?? null,
    },
    integrations: {
      sms: env.SMS_PROVIDER,
      sslcommerz: env.PAYMENT_SSLCOMMERZ_MODE,
      steadfast: env.COURIER_STEADFAST_MODE,
      storage: env.STORAGE_PROVIDER,
      mockStorefrontData: env.USE_MOCK_STOREFRONT_DATA,
    },
  };
}
