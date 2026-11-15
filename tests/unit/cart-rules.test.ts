import { describe, expect, it } from "vitest";

import { checkCartLine, checkNewQuantity, priceChange } from "@/modules/cart/cart-rules";
import {
  cartCookieValue,
  generateCartToken,
  hashCartToken,
  readCartCookie,
} from "@/modules/cart/cart-token";

const SECRET = "x".repeat(40);

describe("cart cookie", () => {
  it("round-trips a signed token", () => {
    const token = generateCartToken();
    expect(readCartCookie(cartCookieValue(token, SECRET), SECRET)).toBe(token);
  });

  it("rejects a forged, truncated or foreign cookie", () => {
    const token = generateCartToken();
    const value = cartCookieValue(token, SECRET);
    expect(readCartCookie(`${generateCartToken()}${value.slice(value.indexOf("."))}`, SECRET)).toBe(
      null,
    );
    expect(readCartCookie(value.slice(0, -2), SECRET)).toBeNull();
    expect(readCartCookie(token, SECRET)).toBeNull();
    expect(readCartCookie(value, "y".repeat(40))).toBeNull();
    expect(readCartCookie(undefined, SECRET)).toBeNull();
    expect(readCartCookie("a".repeat(500), SECRET)).toBeNull();
  });

  it("stores only a hash, different from the token", () => {
    const token = generateCartToken();
    expect(hashCartToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCartToken(token)).not.toContain(token);
  });
});

describe("checkCartLine", () => {
  const base = { quantity: 2, live: true, available: 10, maxQtyPerVariant: 5 };

  it("passes a line within stock and limit", () => {
    expect(checkCartLine(base)).toEqual({ problem: null, suggestedQuantity: null });
  });

  it("blocks an archived or deleted product", () => {
    expect(checkCartLine({ ...base, live: false }).problem).toBe("UNAVAILABLE");
  });

  it("blocks when nothing is left", () => {
    expect(checkCartLine({ ...base, available: 0 }).problem).toBe("OUT_OF_STOCK");
  });

  it("suggests the stock left when the line is over it", () => {
    expect(checkCartLine({ ...base, quantity: 4, available: 3 })).toEqual({
      problem: "LOW_STOCK",
      suggestedQuantity: 3,
    });
  });

  it("suggests the per-item limit when that is lower", () => {
    expect(checkCartLine({ ...base, quantity: 7, available: 20 })).toEqual({
      problem: "OVER_LIMIT",
      suggestedQuantity: 5,
    });
  });
});

describe("priceChange", () => {
  it("reports only a real change", () => {
    expect(priceChange(null, 100)).toBeNull();
    expect(priceChange(100, 100)).toBeNull();
    expect(priceChange(100, 120)).toEqual({ fromPoisha: 100, toPoisha: 120 });
  });
});

describe("checkNewQuantity", () => {
  const base = {
    current: 1,
    next: 2,
    live: true,
    available: 10,
    otherUnits: 0,
    maxQtyPerVariant: 5,
    maxItemsPerOrder: 20,
  };

  it("always allows lowering", () => {
    expect(checkNewQuantity({ ...base, current: 9, next: 3, live: false, available: 0 })).toBe(
      null,
    );
  });

  it("refuses raising an unavailable or sold-out item", () => {
    expect(checkNewQuantity({ ...base, live: false })).toEqual({ refusal: "UNAVAILABLE" });
    expect(checkNewQuantity({ ...base, available: 0 })).toEqual({ refusal: "OUT_OF_STOCK" });
  });

  it("refuses past the per-item limit, the stock, and the order limit", () => {
    expect(checkNewQuantity({ ...base, next: 6 })).toEqual({ refusal: "PER_VARIANT", max: 5 });
    expect(checkNewQuantity({ ...base, next: 4, available: 3 })).toEqual({
      refusal: "STOCK_LIMIT",
      available: 3,
    });
    expect(checkNewQuantity({ ...base, next: 3, otherUnits: 18 })).toEqual({
      refusal: "PER_ORDER",
      max: 20,
    });
  });

  it("allows exactly the limits", () => {
    expect(checkNewQuantity({ ...base, next: 5, available: 5, otherUnits: 15 })).toBeNull();
  });
});
