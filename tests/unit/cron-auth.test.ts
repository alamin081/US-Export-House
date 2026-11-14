import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ CRON_SECRET: "" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ env }));

const { checkCronAuthorization } = await import("@/modules/system/cron-auth");

describe("cron authorization", () => {
  beforeEach(() => {
    env.CRON_SECRET = "a-long-cron-secret-for-tests";
  });

  it("refuses every request when no secret is configured", () => {
    env.CRON_SECRET = "";
    expect(checkCronAuthorization("Bearer ")).toBe("not_configured");
    env.CRON_SECRET = undefined;
    expect(checkCronAuthorization(null)).toBe("not_configured");
  });

  it("accepts only the exact bearer secret", () => {
    expect(checkCronAuthorization("Bearer a-long-cron-secret-for-tests")).toBe("ok");
    expect(checkCronAuthorization("Bearer a-long-cron-secret-for-test")).toBe("unauthorized");
    expect(checkCronAuthorization("a-long-cron-secret-for-tests")).toBe("unauthorized");
    expect(checkCronAuthorization(null)).toBe("unauthorized");
  });
});
