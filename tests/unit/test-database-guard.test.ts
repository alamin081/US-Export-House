import { describe, expect, it } from "vitest";

import {
  checkResetTarget,
  resetStatements,
  resolveTestDatabaseUrl,
  TEST_DATABASE_NAME,
} from "../../scripts/lib/test-database-guard";

/** `npm run db:test:reset` may only ever drop the local us_export_house_test. */

describe("test database reset guard", () => {
  it("accepts only the local test database", () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      const target = checkResetTarget(`postgresql://u:p@${host}:55432/us_export_house_test`);
      expect(target).toMatchObject({ ok: true, name: TEST_DATABASE_NAME });
      if (target.ok) {
        expect(target.maintenanceUrl).toMatch(/\/postgres$/);
        expect(target.label).not.toContain("p@");
      }
    }
  });

  it("refuses the development, production and other projects' databases", () => {
    const refused = [
      "postgresql://u:p@127.0.0.1:55432/us_export_house",
      "postgresql://u:p@localhost:5432/postgres",
      "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require",
      "postgresql://u:p@ep-x.neon.tech/us_export_house_test?sslmode=require",
      "postgresql://u:p@192.168.1.10:5432/us_export_house_test",
      "postgresql://u:p@[::1]:5432/us_export_house_test",
      "postgresql://u:p@localhost:5433/minimart_test",
      "postgresql://u:p@localhost:5432/us_export_house_test_backup",
      "postgresql://u:p@localhost:5432/us_export_house_test2",
      "mysql://u:p@localhost/us_export_house_test",
      "not a url",
    ];
    for (const url of refused) expect(checkResetTarget(url).ok, url).toBe(false);
  });

  it("derives the target like the integration tests, never the dev database itself", () => {
    expect(
      resolveTestDatabaseUrl({ DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/us_export_house" }),
    ).toBe("postgresql://u:p@127.0.0.1:55432/us_export_house_test");
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/us_export_house",
        TEST_DATABASE_URL: "postgresql://u:p@localhost:55432/us_export_house_test",
      }),
    ).toBe("postgresql://u:p@localhost:55432/us_export_house_test");
    expect(() => resolveTestDatabaseUrl({})).toThrow();
  });

  it("sends only a drop and create of the test database", () => {
    expect(resetStatements(TEST_DATABASE_NAME)).toEqual([
      'DROP DATABASE IF EXISTS "us_export_house_test" WITH (FORCE)',
      'CREATE DATABASE "us_export_house_test"',
    ]);
    expect(() => resetStatements("us_export_house")).toThrow();
  });
});
