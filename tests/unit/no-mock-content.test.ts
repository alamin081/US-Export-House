import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phase 12 rule: the storefront takes its content from the database only.
 * The Phase 3 sample data now lives in prisma/seed-data/ for the development
 * seed; nothing under src/ may import it (or any *.mock module) again.
 */

/** The Phase 3 sample constants (image storage's own test mock is allowed). */
const SAMPLE_CONSTANTS =
  /MOCK_(HERO|PROMO|COLLECTIONS|BRAND|SHOWROOMS|ABOUT|FAQ|PRIVACY|SHIPPING|ORDERS|ADDRESSES|CUSTOMER|PRODUCTS|CATEGORIES|REVIEWS)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("no mock content in the app", () => {
  it("has no *.mock module and imports none", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((path) => {
      if (/\.mock\.tsx?$/.test(path)) return true;
      const text = readFileSync(path, "utf8");
      return (
        /from\s+["'][^"']*(\.mock|seed-data)[^"']*["']/.test(text) || SAMPLE_CONSTANTS.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });
});
