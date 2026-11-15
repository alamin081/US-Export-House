import { describe, expect, it } from "vitest";

import { localize, needsBengaliTranslation } from "@/lib/content";
import { formatCount } from "@/lib/number";
import { MOCK_PRODUCTS } from "../../prisma/seed-data/catalog";

describe("bilingual content", () => {
  it("falls back to English when Bengali copy is missing", () => {
    expect(localize({ en: "Navy shirt" }, "bn")).toBe("Navy shirt");
    expect(localize({ en: "Navy shirt", bn: "নেভি শার্ট" }, "bn")).toBe("নেভি শার্ট");
    expect(localize({ en: "Navy shirt", bn: "নেভি শার্ট" }, "en")).toBe("Navy shirt");
  });

  it("flags content that still needs translating", () => {
    expect(needsBengaliTranslation({ en: "Only English" })).toBe(true);
    expect(needsBengaliTranslation({ en: "Only English", bn: "  " })).toBe(true);
    expect(needsBengaliTranslation({ en: "Both", bn: "দুটোই" })).toBe(false);
  });
});

describe("development seed data", () => {
  it("keeps English copy mandatory for every sample product", () => {
    for (const product of MOCK_PRODUCTS) {
      expect(product.name.en.length).toBeGreaterThan(0);
      expect(product.summary.en.length).toBeGreaterThan(0);
      expect(product.description.length).toBeGreaterThan(0);
    }
  });

  it("gives every sample product a unique slug", () => {
    const slugs = MOCK_PRODUCTS.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("display numbers", () => {
  it("formats counts with Latin digits in both languages", () => {
    expect(formatCount(24)).toBe("24");
    expect(formatCount(1_250)).toBe("1,250");
  });
});
