import { describe, expect, it } from "vitest";

import { isAutomatedTestRun, parseServerEnv, storageRootFolder } from "@/config/env-rules";

/**
 * Image storage rules: Cloudinary in every real environment, the mock only in
 * automated test runs, clear refusals otherwise, one folder per environment.
 * Credentials below are fake placeholders.
 */

const BASE = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/us_export_house",
  AUTH_SECRET: "x".repeat(40),
};

const CLOUDINARY = {
  STORAGE_PROVIDER: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "demo-cloud",
  CLOUDINARY_API_KEY: "111111111111111",
  CLOUDINARY_API_SECRET: "fake-secret-for-tests-only-abc",
};

function refusal(raw: Record<string, string>): string {
  try {
    parseServerEnv(raw);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the configuration to be refused");
}

describe("image storage per environment", () => {
  for (const APP_ENV of ["local", "staging", "production"]) {
    it(`APP_ENV=${APP_ENV} starts with Cloudinary credentials`, () => {
      const extra =
        APP_ENV === "production"
          ? {
              SMS_PROVIDER: "bulksms_bd",
              SMS_API_KEY: "k",
              COURIER_STEADFAST_MODE: "live",
              STEADFAST_API_KEY: "a",
              STEADFAST_SECRET_KEY: "b",
            }
          : {};
      const env = parseServerEnv({
        ...BASE,
        ...CLOUDINARY,
        ...extra,
        APP_ENV,
        NODE_ENV: "production",
      });
      expect(env.STORAGE_PROVIDER).toBe("cloudinary");
    });

    it(`APP_ENV=${APP_ENV} refuses the mock outside tests`, () => {
      const message = refusal({
        ...BASE,
        APP_ENV,
        NODE_ENV: "development",
        STORAGE_PROVIDER: "local",
      });
      expect(message).toContain("STORAGE_PROVIDER=local");
      expect(message).toContain("Fix your .env.local");
    });
  }

  it("defaults to Cloudinary and refuses to start without credentials", () => {
    const message = refusal({ ...BASE, APP_ENV: "local", NODE_ENV: "development" });
    expect(message).toContain(
      "requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET",
    );
  });

  it("refuses an API secret that is a copy of the API key", () => {
    const message = refusal({
      ...BASE,
      ...CLOUDINARY,
      CLOUDINARY_API_SECRET: CLOUDINARY.CLOUDINARY_API_KEY,
      NODE_ENV: "development",
    });
    expect(message).toContain("same as CLOUDINARY_API_KEY");
    // The message names the variables, never their values.
    expect(message).not.toContain(CLOUDINARY.CLOUDINARY_API_KEY);
  });

  it("never prints credential values in a refusal", () => {
    const message = refusal({
      ...BASE,
      ...CLOUDINARY,
      CLOUDINARY_API_KEY: "",
      NODE_ENV: "development",
    });
    expect(message).not.toContain(CLOUDINARY.CLOUDINARY_API_SECRET);
  });

  it("allows the mock in Vitest, in CI and in the E2E run against a _test database", () => {
    expect(
      parseServerEnv({ ...BASE, STORAGE_PROVIDER: "local", NODE_ENV: "test" }).STORAGE_PROVIDER,
    ).toBe("local");
    expect(
      parseServerEnv({ ...BASE, STORAGE_PROVIDER: "local", NODE_ENV: "production", CI: "true" })
        .STORAGE_PROVIDER,
    ).toBe("local");
    expect(
      parseServerEnv({
        ...BASE,
        DATABASE_URL: "postgresql://user:pass@localhost:5432/us_export_house_test",
        STORAGE_PROVIDER: "local",
        NODE_ENV: "production",
        E2E_TEST_RUN: "1",
      }).STORAGE_PROVIDER,
    ).toBe("local");
  });

  it("ignores the E2E flag for a real database, and refuses the mock in production even in CI", () => {
    expect(
      refusal({ ...BASE, STORAGE_PROVIDER: "local", NODE_ENV: "production", E2E_TEST_RUN: "1" }),
    ).toContain("only in automated tests");
    expect(
      refusal({
        ...BASE,
        APP_ENV: "production",
        STORAGE_PROVIDER: "local",
        NODE_ENV: "test",
        CI: "true",
      }),
    ).toContain("never allowed when APP_ENV=production");
  });

  it("recognises automated test runs", () => {
    const db = BASE.DATABASE_URL;
    expect(isAutomatedTestRun({ NODE_ENV: "test", DATABASE_URL: db })).toBe(true);
    expect(isAutomatedTestRun({ NODE_ENV: "development", CI: "1", DATABASE_URL: db })).toBe(true);
    expect(isAutomatedTestRun({ NODE_ENV: "development", DATABASE_URL: db })).toBe(false);
    expect(
      isAutomatedTestRun({ NODE_ENV: "production", E2E_TEST_RUN: "1", DATABASE_URL: "not a url" }),
    ).toBe(false);
  });
});

describe("Cloudinary folder per environment", () => {
  it("is ueh/dev, ueh/staging or ueh/prod", () => {
    expect(storageRootFolder({ APP_ENV: "local", CLOUDINARY_FOLDER: "ueh" })).toBe("ueh/dev");
    expect(storageRootFolder({ APP_ENV: "staging", CLOUDINARY_FOLDER: "ueh" })).toBe("ueh/staging");
    expect(storageRootFolder({ APP_ENV: "production", CLOUDINARY_FOLDER: "ueh" })).toBe("ueh/prod");
  });

  it("defaults the root to ueh", () => {
    const env = parseServerEnv({ ...BASE, ...CLOUDINARY, NODE_ENV: "development" });
    expect(storageRootFolder(env)).toBe("ueh/dev");
  });
});
