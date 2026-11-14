import type { RequestMeta } from "@/modules/audit/audit.service";

/**
 * Client IP and user agent for the audit trail and sign-in throttling.
 *
 * `x-forwarded-for` is only trustworthy behind a proxy that overwrites it
 * (Vercel, or Nginx on the future VPS). Its first entry is the original client.
 */
export function requestMetaFromHeaders(headers: Pick<Headers, "get">): RequestMeta {
  const forwarded = headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  const ip = firstForwarded || headers.get("x-real-ip")?.trim() || null;

  const userAgent = headers.get("user-agent");

  return {
    ip: ip === null ? null : ip.slice(0, 64),
    userAgent: userAgent === null ? null : userAgent.slice(0, 300),
  };
}
