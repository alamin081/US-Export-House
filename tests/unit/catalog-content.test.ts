import { describe, expect, it } from "vitest";

import { localize, needsBengaliTranslation } from "@/lib/content";
import { formatCount } from "@/lib/number";
import {
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  MOCK_PRODUCTS,
} from "@/modules/catalog/catalog.mock";
import { findOrderForTracking, MOCK_ORDERS } from "@/modules/orders/orders.mock";

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

  it("keeps English copy mandatory for every sample product", () => {
    for (const product of MOCK_PRODUCTS) {
      expect(product.name.en.length).toBeGreaterThan(0);
      expect(product.summary.en.length).toBeGreaterThan(0);
      expect(product.description.length).toBeGreaterThan(0);
    }
  });

  it("includes at least one product without Bengali copy, to exercise the fallback", () => {
    const untranslated = MOCK_PRODUCTS.filter((product) => product.name.bn === undefined);
    expect(untranslated.length).toBeGreaterThan(0);
  });
});

describe("catalogue queries", () => {
  it("filters by category", () => {
    const denim = getProducts({ category: "denim-jeans" });
    expect(denim.length).toBe(6);
    expect(denim.every((product) => product.categorySlug === "denim-jeans")).toBe(true);
  });

  it("sorts by price in both directions", () => {
    const ascending = getProducts({ sort: "price-asc" }).map((p) => p.pricePoisha);
    const descending = getProducts({ sort: "price-desc" }).map((p) => p.pricePoisha);

    expect([...ascending].sort((a, b) => a - b)).toEqual(ascending);
    expect(ascending[0]).toBe(descending[descending.length - 1]);
  });

  it("applies price bounds and size filters together", () => {
    const result = getProducts({ minPricePoisha: 300_000, sizes: ["32"] });
    expect(result.length).toBeGreaterThan(0);
    for (const product of result) {
      expect(product.pricePoisha).toBeGreaterThanOrEqual(300_000);
      expect(product.sizes).toContain("32");
    }
  });

  it("never recommends the product you are already looking at", () => {
    const product = getProductBySlug("slim-fit-indigo-jeans");
    expect(product).toBeDefined();
    if (product === undefined) return;

    const related = getRelatedProducts(product, 4);
    expect(related.length).toBeGreaterThan(0);
    expect(related.some((item) => item.slug === product.slug)).toBe(false);
  });

  it("gives every product a unique slug and SKU", () => {
    expect(new Set(MOCK_PRODUCTS.map((p) => p.slug)).size).toBe(MOCK_PRODUCTS.length);
    expect(new Set(MOCK_PRODUCTS.map((p) => p.sku)).size).toBe(MOCK_PRODUCTS.length);
  });
});

describe("order tracking lookup", () => {
  const sample = MOCK_ORDERS[0];

  it("finds an order when the order number and phone match", () => {
    expect(sample).toBeDefined();
    if (sample === undefined) return;

    const last6 = sample.address.phone.slice(-6);
    expect(findOrderForTracking(sample.orderNumber, last6)?.orderNumber).toBe(sample.orderNumber);
    expect(findOrderForTracking(sample.orderNumber.toLowerCase(), last6)).toBeDefined();
  });

  it("refuses to reveal an order on the order number alone", () => {
    if (sample === undefined) return;
    expect(findOrderForTracking(sample.orderNumber, "")).toBeUndefined();
    expect(findOrderForTracking(sample.orderNumber, "000000")).toBeUndefined();
  });

  it("returns nothing for an unknown order number", () => {
    expect(findOrderForTracking("UEH-2026-999", "345678")).toBeUndefined();
  });
});

describe("display numbers", () => {
  it("formats counts with Latin digits in both languages", () => {
    expect(formatCount(24)).toBe("24");
    expect(formatCount(1_250)).toBe("1,250");
  });
});
