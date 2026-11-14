import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";

/**
 * Authorises a scheduled-job request. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`. Without a configured secret every
 * request is refused, so a cron route can never run unauthenticated.
 */
export type CronAuthResult = "ok" | "not_configured" | "unauthorized";

export function checkCronAuthorization(header: string | null): CronAuthResult {
  const secret = env.CRON_SECRET;
  if (secret === undefined || secret === "") return "not_configured";
  if (header === null) return "unauthorized";

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  if (expected.length !== received.length) return "unauthorized";
  return timingSafeEqual(expected, received) ? "ok" : "unauthorized";
}
