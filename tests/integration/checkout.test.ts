import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/config/env";
import { db } from "@/lib/db";
import { SYSTEM_ROLES } from "@/modules/access/permissions";
import { addToCart, getCartView } from "@/modules/cart/cart.service";
import { issueFormToken, keyedHash } from "@/modules/checkout/checkout-crypto";
import {
  placeOrder,
  quoteCheckout,
  type PlaceOrderResult,
  type QuoteView,
} from "@/modules/checkout/checkout.service";
import { applyStockMovements } from "@/modules/inventory/inventory.service";
import { runInventoryTransaction } from "@/modules/inventory/inventory.repository";
import { findLedgerMismatches } from "@/modules/inventory/ledger-check.repository";
import {
  setNotificationSink,
  type NotificationEvent,
} from "@/modules/notifications/notification.service";

/**
 * Guest checkout against the real test database: zones, the order
 * transaction, races on the last piece and on a one-use coupon, idempotency,
 * changed prices, fraud limits and the ledger. Every record carries a per-run
 * prefix; settings changed for a test are put back.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const run = RUN.toLowerCase();
let ipCounter = 0;
let phoneCounter = 0;

/** A fresh client IP per call, so the per-IP limit only bites where tested. */
const meta = () => ({
  ip: `203.0.${(ipCounter += 1) % 250}.${Math.floor(Math.random() * 250)}`,
  userAgent: "checkout-it",
});
const freshPhone = () =>
  `017${String(Date.now() % 1_000_000).padStart(6, "0")}${String((phoneCounter += 1) % 100).padStart(2, "0")}`;

const variants: Record<string, string> = {};
let productId = "";
let archivedProductId = "";
let locationId = "";
const events: NotificationEvent[] = [];
const restoreSettings = new Map<string, string | null>();

type Area = { divisionId: string; districtId: string; upazilaId: string };
const areas: Record<"city" | "savar" | "gazipur" | "outside" | "dhakaFallback", Area> = {
  city: { divisionId: "", districtId: "dist-47", upazilaId: "dhk-metro-13" },
  savar: { divisionId: "", districtId: "dist-47", upazilaId: "upz-365" },
  gazipur: { divisionId: "", districtId: "dist-41", upazilaId: "" },
  outside: { divisionId: "", districtId: "dist-01", upazilaId: "" },
  dhakaFallback: { divisionId: "", districtId: "dist-47", upazilaId: `upz-it-${run}` },
};

async function setSetting(key: string, value: string) {
  if (!restoreSettings.has(key)) {
    const row = await db.setting.findUnique({ where: { key } });
    restoreSettings.set(key, row?.value ?? null);
  }
  await db.setting.upsert({
    where: { key },
    create: { key, value, valueType: "INT", group: "checkout" },
    update: { value },
  });
}

async function cart(lines: Array<[string, number]>): Promise<string> {
  let token: string | null = null;
  for (const [key, quantity] of lines) {
    const result = await addToCart(token, variants[key]!, quantity);
    if (!result.ok) throw new Error(`could not add ${key}: ${JSON.stringify(result)}`);
    token = result.token;
  }
  return token!;
}

async function quote(token: string, area: Area, couponCode?: string, phone?: string) {
  const result = await quoteCheckout(
    token,
    { area, couponCode: couponCode ?? null },
    meta(),
    phone === undefined ? null : `+88${phone}`,
  );
  if (!result.ok) throw new Error(result.error);
  return result.quote;
}

function input(q: QuoteView, area: Area, overrides: Record<string, unknown> = {}) {
  return {
    area,
    name: "Integration Customer",
    phone: freshPhone(),
    email: "",
    street: "House 1, Road 2, Block C",
    landmark: "",
    note: "",
    couponCode: q.coupon?.code ?? null,
    quoteHash: q.hash,
    idempotencyKey: `${run}-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    formToken: issueFormToken(Date.now() - 10_000, env.AUTH_SECRET),
    website: "",
    paymentMethod: "COD",
    ...overrides,
  };
}

async function quoteAndPlace(
  lines: Array<[string, number]>,
  area: Area = areas.city,
  overrides: Record<string, unknown> = {},
  couponCode?: string,
): Promise<{ result: PlaceOrderResult; token: string; q: QuoteView }> {
  const token = await cart(lines);
  const q = await quote(token, area, couponCode, overrides.phone as string | undefined);
  const result = await placeOrder(token, input(q, area, overrides), meta());
  return { result, token, q };
}

async function reserved(key: string) {
  const row = await db.inventoryLevel.findUnique({
    where: { variantId_locationId: { variantId: variants[key]!, locationId } },
    select: { reserved: true, onHand: true },
  });
  return row ?? { reserved: 0, onHand: 0 };
}

async function ordersFor(phoneLocal: string) {
  return db.order.findMany({ where: { customerPhone: `+88${phoneLocal}` } });
}

beforeAll(async () => {
  setNotificationSink((event) => {
    events.push(event);
  });
  const location = await db.location.findFirstOrThrow({
    where: { isDefaultOnlineFulfillment: true, isActive: true, deletedAt: null },
  });
  locationId = location.id;

  // Address chains: any upazila of Gazipur and of district 01, and one test-only
  // upazila in Dhaka district WITHOUT its own mapping (the district fallback).
  for (const key of ["city", "savar", "gazipur", "outside", "dhakaFallback"] as const) {
    const district = await db.geoDistrict.findUniqueOrThrow({
      where: { id: areas[key].districtId },
    });
    areas[key].divisionId = district.divisionId;
    if (areas[key].upazilaId === "") {
      const upazila = await db.geoUpazila.findFirstOrThrow({
        where: { districtId: district.id, kind: "UPAZILA" },
      });
      areas[key].upazilaId = upazila.id;
    }
  }
  await db.geoUpazila.create({
    data: {
      id: areas.dhakaFallback.upazilaId,
      districtId: "dist-47",
      nameEn: `IT thana ${RUN}`,
      nameBn: `IT থানা ${RUN}`,
      kind: "METRO_THANA",
    },
  });

  const category = await db.category.create({
    data: { slug: `it-co-${run}`, nameEn: `Checkout ${RUN}` },
  });
  const product = await db.product.create({
    data: {
      slug: `it-co-${run}`,
      nameEn: `Checkout Shirt ${RUN}`,
      nameBn: `চেকআউট শার্ট ${RUN}`,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: {
        create: [
          { sku: `CO-${RUN}-A`, pricePoisha: 150_000, labelEn: "A" },
          { sku: `CO-${RUN}-B`, pricePoisha: 100_000, labelEn: "B" },
          { sku: `CO-${RUN}-SALE`, pricePoisha: 80_000, comparePricePoisha: 100_000, labelEn: "S" },
          { sku: `CO-${RUN}-LAST`, pricePoisha: 50_000, labelEn: "L" },
          { sku: `CO-${RUN}-ONE`, pricePoisha: 60_000, labelEn: "O" },
          { sku: `CO-${RUN}-BIG`, pricePoisha: 900_000, labelEn: "BIG" },
        ],
      },
    },
    select: { id: true, variants: { select: { id: true, sku: true } } },
  });
  productId = product.id;
  for (const row of product.variants) variants[row.sku.split("-").pop()!] = row.id;
  const archived = await db.product.create({
    data: {
      slug: `it-co-arch-${run}`,
      nameEn: `Soon archived ${RUN}`,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: { create: [{ sku: `CO-${RUN}-ARCH`, pricePoisha: 70_000, labelEn: "X" }] },
    },
    select: { id: true, variants: { select: { id: true } } },
  });
  archivedProductId = archived.id;
  variants.ARCH = archived.variants[0]!.id;

  const stock: Record<string, number> = {
    A: 200,
    B: 200,
    SALE: 50,
    LAST: 1,
    ONE: 50,
    BIG: 20,
    ARCH: 5,
  };
  await runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      Object.entries(stock).map(([key, quantity]) => ({
        variantId: variants[key]!,
        locationId,
        type: "OPENING" as const,
        quantity,
        userId: null,
        reason: "checkout integration",
      })),
    ),
  );

  // These suites place many orders from one process: the per-IP limit is
  // exercised in its own test with a lowered value.
  await setSetting("checkout.minFillSeconds", "3");
  await setSetting("checkout.maxOrdersPerIpPerHour", "20");
});

afterAll(async () => {
  setNotificationSink(null);
  for (const [key, value] of restoreSettings) {
    if (value === null) await db.setting.deleteMany({ where: { key } });
    else await db.setting.update({ where: { key }, data: { value } });
  }
  await db.$disconnect();
});

// ---------------------------------------------------------------------------

describe("delivery zones", () => {
  it("maps a Dhaka metro thana to the city, Dhaka district's upazilas and Gazipur to the suburbs", async () => {
    const token = await cart([["A", 1]]);
    expect((await quote(token, areas.city)).zone?.code).toBe("inside_dhaka");
    expect((await quote(token, areas.savar)).zone?.code).toBe("dhaka_suburbs");
    expect((await quote(token, areas.gazipur)).zone?.code).toBe("dhaka_suburbs");
    expect((await quote(token, areas.outside)).zone?.code).toBe("outside_dhaka");
  });

  it("falls back to the Dhaka district mapping (city) for a thana without its own", async () => {
    const token = await cart([["A", 1]]);
    expect((await quote(token, areas.dhakaFallback)).zone?.code).toBe("inside_dhaka");
  });

  it("charges the zone rate below the free threshold and nothing above it", async () => {
    const zone = await db.shippingZone.findUniqueOrThrow({ where: { code: "outside_dhaka" } });
    const small = await quote(await cart([["B", 1]]), areas.outside);
    expect(small.shippingPoisha).toBe(zone.ratePoisha);
    expect(small.totalPoisha).toBe(small.subtotalPoisha + zone.ratePoisha);
    const large = await quote(await cart([["A", 2]]), areas.outside);
    expect(large.shippingPoisha).toBe(0);
    expect(large.freeShipping).toBe(true);
  });

  it("refuses an address whose ids do not belong together", async () => {
    const { result } = await quoteAndPlace([["A", 1]], areas.city, {
      area: { ...areas.city, districtId: "dist-41" },
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("placing an order", () => {
  it("creates the order, items, history and payment, reserves stock and clears the cart", async () => {
    const before = await reserved("A");
    events.length = 0;
    const phone = freshPhone();
    const { result, token, q } = await quoteAndPlace(
      [
        ["A", 1],
        ["B", 2],
      ],
      areas.savar,
      { phone },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderNumber).toMatch(/^UEH-\d{4}-\d{5}$/);

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true, statusHistory: true, payments: true },
    });
    expect(order).toMatchObject({
      status: "PENDING",
      paymentStatus: "UNPAID",
      paymentMethod: "COD",
      channel: "ONLINE",
      customerPhone: `+88${phone}`,
      locationId,
      zoneCode: "dhaka_suburbs",
      shipUpazilaId: "upz-365",
      shipUpazilaName: "Savar",
      subtotalPoisha: 350_000,
      totalPoisha: q.totalPoisha,
    });
    expect(order.totalPoisha).toBe(
      order.subtotalPoisha - order.discountPoisha + order.shippingPoisha,
    );
    expect(order.items).toHaveLength(2);
    expect(order.items.find((item) => item.sku === `CO-${RUN}-B`)).toMatchObject({
      unitPricePoisha: 100_000,
      quantity: 2,
      lineTotalPoisha: 200_000,
      productNameEn: `Checkout Shirt ${RUN}`,
    });
    expect(order.statusHistory.map((row) => row.status)).toEqual(["PENDING"]);
    expect(order.payments).toEqual([
      expect.objectContaining({
        provider: "COD",
        mode: "LIVE",
        status: "UNPAID",
        amountPoisha: q.totalPoisha,
      }),
    ]);
    expect((await reserved("A")).reserved).toBe(before.reserved + 1);
    expect((await getCartView(token)).lines).toHaveLength(0);

    // One notification, with the number and total only: no phone, no address.
    expect(events).toEqual([
      { type: "order.placed", orderNumber: result.orderNumber, totalPoisha: q.totalPoisha },
    ]);
    expect(JSON.stringify(events)).not.toContain(phone.slice(-8));
  });

  it("returns the same order for a repeated submit (idempotency)", async () => {
    const token = await cart([["B", 1]]);
    const q = await quote(token, areas.city);
    const body = input(q, areas.city);
    const first = await placeOrder(token, body, meta());
    const second = await placeOrder(token, body, meta());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.reused).toBe(true);
    expect(await db.order.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
  });

  it("refuses totals the server did not show (wrong client price)", async () => {
    const token = await cart([["A", 1]]);
    const q = await quote(token, areas.city);
    const phone = freshPhone();
    const result = await placeOrder(
      token,
      input({ ...q, hash: "0".repeat(32) }, areas.city, { phone }),
      meta(),
    );
    expect(result).toMatchObject({ ok: false, error: "QUOTE_CHANGED" });
    expect(await ordersFor(phone)).toHaveLength(0);
  });

  it("refuses when a price changed after the checkout was shown", async () => {
    const token = await cart([["ONE", 1]]);
    const q = await quote(token, areas.city);
    await db.productVariant.update({ where: { id: variants.ONE }, data: { pricePoisha: 65_000 } });
    try {
      const phone = freshPhone();
      const result = await placeOrder(token, input(q, areas.city, { phone }), meta());
      expect(result).toMatchObject({ ok: false, error: "QUOTE_CHANGED" });
      expect(await ordersFor(phone)).toHaveLength(0);
      // The new quote shows the new price and goes through.
      const fresh = await quote(token, areas.city);
      expect(fresh.subtotalPoisha).toBe(65_000);
      expect((await placeOrder(token, input(fresh, areas.city), meta())).ok).toBe(true);
    } finally {
      await db.productVariant.update({
        where: { id: variants.ONE },
        data: { pricePoisha: 60_000 },
      });
    }
  });

  it("blocks checkout with an archived product in the cart", async () => {
    const token = await cart([
      ["ARCH", 1],
      ["B", 1],
    ]);
    const q = await quote(token, areas.city);
    await db.product.update({ where: { id: archivedProductId }, data: { status: "ARCHIVED" } });
    const view = await getCartView(token);
    expect(view.canCheckout).toBe(false);
    expect(view.lines.find((line) => line.variantId === variants.ARCH)?.problem).toBe(
      "UNAVAILABLE",
    );
    const phone = freshPhone();
    const result = await placeOrder(token, input(q, areas.city, { phone }), meta());
    expect(result).toMatchObject({ ok: false, error: "CART_CHANGED" });
    expect(await ordersFor(phone)).toHaveLength(0);
  });

  it("takes the last piece exactly once when ten customers order it at the same moment", async () => {
    const before = await reserved("LAST");
    expect(before.onHand - before.reserved).toBe(1);
    const carts = await Promise.all(Array.from({ length: 10 }, () => cart([["LAST", 1]])));
    const quotes = await Promise.all(carts.map((token) => quote(token, areas.city)));
    const phones = carts.map(() => freshPhone());
    const results = await Promise.all(
      carts.map((token, index) =>
        placeOrder(token, input(quotes[index]!, areas.city, { phone: phones[index] }), meta()),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    // Refused in the transaction (stock locked) or, if the winner had already
    // committed when the cart was read, before it.
    for (const result of results.filter((item) => !item.ok)) {
      expect(["OUT_OF_STOCK", "CART_CHANGED"]).toContain(!result.ok && result.error);
    }
    expect((await reserved("LAST")).reserved).toBe(before.reserved + 1);
    const placed = await db.order.count({
      where: { customerPhone: { in: phones.map((phone) => `+88${phone}`) } },
    });
    expect(placed).toBe(1); // stock short -> nothing saved for the other nine
  });
});

describe("coupons", () => {
  async function coupon(code: string, data: Record<string, unknown>) {
    return db.coupon.create({
      data: { code, type: "FIXED", value: 10_000, channel: "ONLINE", ...data },
    });
  }

  it("lets a one-use coupon through exactly once under ten simultaneous orders", async () => {
    const code = `ONCE${RUN}`;
    const created = await coupon(code, { usageLimit: 1 });
    const carts = await Promise.all(Array.from({ length: 10 }, () => cart([["B", 1]])));
    const quotes = await Promise.all(carts.map((token) => quote(token, areas.outside, code)));
    for (const q of quotes) expect(q.coupon?.code).toBe(code);
    const results = await Promise.all(
      carts.map((token, index) => placeOrder(token, input(quotes[index]!, areas.outside), meta())),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((item) => !item.ok)) {
      expect(result).toMatchObject({ ok: false, error: "COUPON_INVALID" });
    }
    const after = await db.coupon.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.usedCount).toBe(1);
    expect(await db.couponRedemption.count({ where: { couponId: created.id } })).toBe(1);
  });

  it("splits the discount over eligible lines and records it on each item", async () => {
    const code = `PCT${RUN}`;
    await coupon(code, { type: "PERCENTAGE", value: 10 });
    const { result, q } = await quoteAndPlace(
      [
        ["A", 1],
        ["SALE", 1],
      ],
      areas.city,
      {},
      code,
    );
    expect(q.discountPoisha).toBe(15_000); // the sale item is not discounted
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = await db.orderItem.findMany({
      where: { order: { orderNumber: result.orderNumber } },
    });
    expect(items.reduce((sum, item) => sum + item.discountPoisha, 0)).toBe(15_000);
    expect(items.find((item) => item.sku.endsWith("-SALE"))?.discountPoisha).toBe(0);
  });

  it("measures the minimum on eligible items only", async () => {
    const code = `MIN${RUN}`;
    await coupon(code, { minSubtotalPoisha: 150_000 });
    const token = await cart([["SALE", 2]]); // ৳1,600, all on sale
    const q = await quote(token, areas.city, code);
    expect(q.couponProblem).toBe("NOT_APPLICABLE");
    const token2 = await cart([
      ["B", 1],
      ["SALE", 1],
    ]); // eligible ৳1,000 < ৳1,500
    const q2 = await quote(token2, areas.city, code);
    expect(q2.couponProblem).toBe("MIN_SUBTOTAL");
    expect(q2.couponMinPoisha).toBe(150_000);
  });

  it("makes delivery free with a free-shipping coupon", async () => {
    const code = `SHIP${RUN}`;
    await coupon(code, { type: "FREE_SHIPPING", value: 0 });
    const q = await quote(await cart([["B", 1]]), areas.outside, code);
    expect(q).toMatchObject({ shippingPoisha: 0, discountPoisha: 0 });
    expect(q.coupon?.code).toBe(code);
    expect(q.totalPoisha).toBe(q.subtotalPoisha);
  });

  it("does not count cancelled orders towards the per-phone limit", async () => {
    const code = `ONEPP${RUN}`;
    await coupon(code, { usageLimitPerCustomer: 1 });
    const phone = freshPhone();
    const first = await quoteAndPlace([["B", 1]], areas.city, { phone }, code);
    expect(first.result.ok).toBe(true);
    const blocked = await quote(await cart([["A", 1]]), areas.city, code, phone);
    expect(blocked.couponProblem).toBe("INVALID");
    if (!first.result.ok) return;
    await db.order.update({
      where: { orderNumber: first.result.orderNumber },
      data: { status: "CANCELLED" },
    });
    const again = await quote(await cart([["A", 1]]), areas.city, code, phone);
    expect(again.coupon?.code).toBe(code);
  });

  it("limits wrong-code guesses per IP", async () => {
    await setSetting("checkout.couponAttemptsPer15Min", "3");
    const token = await cart([["B", 1]]);
    const fixed = { ip: `192.0.2.${Math.floor(Math.random() * 250)}`, userAgent: "guess" };
    const problems: Array<string | null> = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await quoteCheckout(
        token,
        { area: areas.city, couponCode: `NOPE${RUN}${attempt}` },
        fixed,
      );
      problems.push(result.ok ? result.quote.couponProblem : null);
    }
    expect(problems).toEqual(["INVALID", "INVALID", "INVALID", "RATE_LIMITED", "RATE_LIMITED"]);
  });
});

describe("fraud protection", () => {
  it("refuses a blocked phone with a generic answer and logs only hashes", async () => {
    const phone = freshPhone();
    await db.blockedPhone.create({ data: { phone: `+88${phone}`, reason: "integration" } });
    const { result } = await quoteAndPlace([["B", 1]], areas.city, { phone });
    expect(result).toEqual({ ok: false, error: "NOT_ACCEPTED" });
    const hash = keyedHash("phone", `+88${phone}`, env.AUTH_SECRET);
    const logged = await db.checkoutRejection.findFirstOrThrow({ where: { phoneHash: hash } });
    expect(logged.reason).toBe("BLOCKED_PHONE");
    expect(JSON.stringify(logged)).not.toContain(phone.slice(-8));
  });

  it("allows three open orders per phone in 24 hours, then refuses", async () => {
    const phone = freshPhone();
    const keys = ["A", "B", "ONE", "SALE"];
    const results: PlaceOrderResult[] = [];
    for (const key of keys)
      results.push((await quoteAndPlace([[key, 1]], areas.city, { phone })).result);
    expect(results.map((result) => result.ok)).toEqual([true, true, true, false]);
    expect(results[3]).toMatchObject({ ok: false, error: "ORDER_LIMIT" });
  });

  it("limits orders per IP per hour", async () => {
    await setSetting("checkout.maxOrdersPerIpPerHour", "2");
    try {
      const fixed = { ip: `198.18.0.${Math.floor(Math.random() * 250)}`, userAgent: "ip" };
      const outcomes: boolean[] = [];
      for (let index = 0; index < 3; index += 1) {
        const token = await cart([["B", 1]]);
        const q = await quote(token, areas.city);
        outcomes.push((await placeOrder(token, input(q, areas.city), fixed)).ok);
      }
      expect(outcomes).toEqual([true, true, false]);
    } finally {
      await setSetting("checkout.maxOrdersPerIpPerHour", "20");
    }
  });

  it("points a duplicate order (same phone, same items, 30 minutes) at the first one", async () => {
    const phone = freshPhone();
    const first = await quoteAndPlace(
      [
        ["A", 1],
        ["B", 1],
      ],
      areas.city,
      { phone },
    );
    const second = await quoteAndPlace(
      [
        ["B", 1],
        ["A", 1],
      ],
      areas.city,
      { phone },
    );
    expect(first.result.ok).toBe(true);
    if (!first.result.ok) return;
    expect(second.result).toEqual({
      ok: false,
      error: "DUPLICATE",
      orderNumber: first.result.orderNumber,
    });
  });

  it("refuses the honeypot and a form sent faster than a person can fill it", async () => {
    const bot = await quoteAndPlace([["B", 1]], areas.city, { website: "http://spam.example" });
    expect(bot.result).toEqual({ ok: false, error: "NOT_ACCEPTED" });
    const fast = await quoteAndPlace([["B", 1]], areas.city, {
      formToken: issueFormToken(Date.now() - 500, env.AUTH_SECRET),
    });
    expect(fast.result).toEqual({ ok: false, error: "TOO_FAST" });
    const forged = await quoteAndPlace([["B", 1]], areas.city, {
      formToken: `${Date.now() - 10_000}.forged`,
    });
    expect(forged.result).toEqual({ ok: false, error: "FORM_EXPIRED" });
  });

  it("refuses cash on delivery above the limit and flags large first orders for review", async () => {
    await setSetting("checkout.codMaxTotalPoisha", "2000000");
    const over = await quoteAndPlace([["BIG", 3]], areas.city); // ৳27,000
    expect(over.q.codAllowed).toBe(false);
    expect(over.result).toMatchObject({ ok: false, error: "COD_LIMIT" });
    const big = await quoteAndPlace([["BIG", 2]], areas.city); // ৳18,000, first order
    expect(big.result.ok).toBe(true);
    if (!big.result.ok) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: big.result.orderNumber },
    });
    expect(order.reviewReasons).toContain("FIRST_ORDER_HIGH_VALUE");
  });
});

describe("data checks", () => {
  it("database roles hold the Phase 8 permissions defined in code", async () => {
    for (const name of ["Super Admin", "Store Manager", "Order Staff"]) {
      const role = await db.role.findFirstOrThrow({ where: { name } });
      const definition = SYSTEM_ROLES.find((item) => item.name === name)!;
      const phase8 = ["coupon.manage", "shipping.manage", "checkout.settings", "customer.block"];
      for (const key of phase8) {
        expect(role.permissions.includes(key)).toBe(
          (definition.permissions as readonly string[]).includes(key),
        );
      }
    }
  });

  it("every stock row still equals its ledger (inventory:verify)", async () => {
    expect((await findLedgerMismatches(db)).mismatches).toEqual([]);
    expect(productId).not.toBe("");
  });
});
