import { describe, expect, it } from "vitest";

import { csvField, csvStream, poishaToTaka, toCsv, CSV_BOM } from "@/modules/reports/report-csv";
import {
  allocate,
  codAgeBucket,
  emptyFact,
  lineTotals,
  totalsOf,
  type LineFact,
} from "@/modules/reports/report-math";
import {
  ageInDays,
  bucketsIn,
  dhakaDateKey,
  dhakaMidnight,
  formatDhakaDateTime,
  resolveRange,
  weekStart,
} from "@/modules/reports/report-time";
import { parseReportSettings } from "@/modules/settings/report-settings";

const SATURDAY = 6;

describe("Bangladesh day boundaries", () => {
  it("puts 17:59:59 UTC on one Dhaka day and 18:00:00 UTC on the next", () => {
    expect(dhakaDateKey(new Date("2026-11-14T17:59:59.999Z"))).toBe("2026-11-14");
    expect(dhakaDateKey(new Date("2026-11-14T18:00:00.000Z"))).toBe("2026-11-15");
  });

  it("starts a Dhaka day at 18:00 UTC the day before", () => {
    expect(dhakaMidnight("2026-11-15").toISOString()).toBe("2026-11-14T18:00:00.000Z");
  });

  it("resolves today as a half-open range", () => {
    const range = resolveRange({
      preset: "today",
      now: new Date("2026-11-15T05:00:00Z"),
      weekStartsOn: SATURDAY,
    });
    expect(range.fromKey).toBe("2026-11-15");
    expect(range.from.toISOString()).toBe("2026-11-14T18:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-15T18:00:00.000Z");
  });

  it("uses the Dhaka date even when UTC is still on the previous day", () => {
    // 20:00 UTC on the 14th is 02:00 on the 15th in Dhaka.
    const range = resolveRange({
      preset: "yesterday",
      now: new Date("2026-11-14T20:00:00Z"),
      weekStartsOn: SATURDAY,
    });
    expect(range.fromKey).toBe("2026-11-14");
  });

  it("starts the week on Saturday", () => {
    // 2026-11-15 is a Sunday; the week began on Saturday the 14th.
    expect(weekStart("2026-11-15", SATURDAY)).toBe("2026-11-14");
    expect(weekStart("2026-11-14", SATURDAY)).toBe("2026-11-14");
    expect(weekStart("2026-11-13", SATURDAY)).toBe("2026-11-07");
  });

  it("finds last month across a year boundary", () => {
    const range = resolveRange({
      preset: "last_month",
      now: new Date("2027-01-10T06:00:00Z"),
      weekStartsOn: SATURDAY,
    });
    expect([range.fromKey, range.toKey]).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("rejects an invalid or over-long custom range by falling back to today", () => {
    const now = new Date("2026-11-15T06:00:00Z");
    expect(
      resolveRange({ preset: "custom", from: "2026-02-30", to: "2026-03-01", now, weekStartsOn: 6 })
        .preset,
    ).toBe("today");
    expect(
      resolveRange({ preset: "custom", from: "2024-01-01", to: "2026-01-01", now, weekStartsOn: 6 })
        .preset,
    ).toBe("today");
    const swapped = resolveRange({
      preset: "custom",
      from: "2026-11-10",
      to: "2026-11-01",
      now,
      weekStartsOn: 6,
    });
    expect([swapped.fromKey, swapped.toKey]).toEqual(["2026-11-01", "2026-11-10"]);
  });

  it("lists month buckets including February", () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-01-15",
      to: "2026-03-02",
      now: new Date(),
      weekStartsOn: SATURDAY,
    });
    expect(bucketsIn(range, "month", SATURDAY)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("counts COD age in Dhaka calendar days", () => {
    expect(ageInDays(new Date("2026-11-01T17:00:00Z"), new Date("2026-11-08T19:00:00Z"))).toBe(8);
    expect(codAgeBucket(7)).toBe("0-7");
    expect(codAgeBucket(8)).toBe("8-15");
    expect(codAgeBucket(15)).toBe("8-15");
    expect(codAgeBucket(16)).toBe("15+");
  });

  it("formats CSV dates in Dhaka time", () => {
    expect(formatDhakaDateTime(new Date("2026-11-14T18:30:00Z"))).toBe("2026-11-15 00:30");
  });
});

describe("sales formulas", () => {
  it("takes refunds, exchange credit and delivery returns off net sales", () => {
    // Plan example: ৳3,000 order, ৳300 coupon, ৳70 delivery; ৳810 refund later.
    const sale = {
      ...emptyFact("2026-11-10", "ONLINE", "wh"),
      orders: 1,
      grossPoisha: 300_000,
      discountPoisha: 30_000,
      shippingPoisha: 7_000,
    };
    const refund = { ...emptyFact("2026-11-14", "ONLINE", "wh"), refundGoodsPoisha: 81_000 };
    const totals = totalsOf([sale, refund]);
    expect(totals.goodsSalesPoisha).toBe(270_000);
    expect(totals.netSalesPoisha).toBe(189_000);
    expect(totals.deliveryIncomePoisha).toBe(7_000);
    expect(totals.averageOrderPoisha).toBe(270_000);

    const more = totalsOf([
      sale,
      refund,
      { ...emptyFact("2026-11-15", "ONLINE", "wh"), exchangeCreditPoisha: 50_000 },
      {
        ...emptyFact("2026-11-15", "ONLINE", "wh"),
        deliveryReturnOrders: 1,
        deliveryReturnGoodsPoisha: 100_000,
        deliveryReturnShippingPoisha: 7_000,
      },
    ]);
    expect(more.netSalesPoisha).toBe(189_000 - 50_000 - 100_000);
    expect(more.deliveryIncomePoisha).toBe(0);
  });

  it("splits refunds at the till from the rest", () => {
    const totals = totalsOf([
      {
        ...emptyFact("2026-11-15", "STORE", "br"),
        refundGoodsPoisha: 10_000,
        refundShippingPoisha: 0,
        tillRefundPoisha: 4_000,
      },
    ]);
    expect(totals.refundsAtTillPoisha).toBe(4_000);
    expect(totals.refundsElsewherePoisha).toBe(6_000);
  });

  it("has no average without orders", () => {
    expect(totalsOf([]).averageOrderPoisha).toBeNull();
  });

  it("allocates whole poisha that always add up", () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(81_000, [45_000, 45_000]).reduce((a, b) => a + b, 0)).toBe(81_000);
    expect(allocate(500, [0, 0])).toEqual([500, 0]);
    expect(allocate(0, [3, 5])).toEqual([0, 0]);
  });
});

function line(overrides: Partial<LineFact>): LineFact {
  return {
    variantId: "v",
    sku: "SKU",
    productName: "Shirt",
    size: "M",
    colour: "White",
    channel: "STORE",
    locationId: "br",
    costKnown: true,
    soldQty: 0,
    grossPoisha: 0,
    discountPoisha: 0,
    returnedQty: 0,
    returnedPoisha: 0,
    costPoisha: 0,
    ...overrides,
  };
}

describe("profit", () => {
  it("uses the cost at sale and gives restocked cost back", () => {
    const totals = lineTotals([
      line({ soldQty: 2, grossPoisha: 300_000, discountPoisha: 0, costPoisha: 180_000 }),
      // One shirt back to stock: ৳1,500 refunded, ৳900 cost back.
      line({ returnedQty: 1, returnedPoisha: 150_000, costPoisha: -90_000 }),
    ]);
    expect(totals.netPoisha).toBe(150_000);
    expect(totals.costPoisha).toBe(90_000);
    expect(totals.profitPoisha).toBe(60_000);
    expect(totals.marginPercent).toBe(40);
  });

  it("keeps sales with unknown cost apart and never guesses", () => {
    const totals = lineTotals([
      line({ soldQty: 1, grossPoisha: 100_000, costPoisha: 60_000 }),
      line({ soldQty: 1, grossPoisha: 50_000, costKnown: false }),
    ]);
    expect(totals.knownNetPoisha).toBe(100_000);
    expect(totals.unknownCostNetPoisha).toBe(50_000);
    expect(totals.profitPoisha).toBe(40_000);
  });

  it("has no profit when no line has a cost", () => {
    const totals = lineTotals([line({ soldQty: 1, grossPoisha: 50_000, costKnown: false })]);
    expect(totals.profitPoisha).toBeNull();
    expect(totals.marginPercent).toBeNull();
  });
});

describe("report CSV", () => {
  it("starts with a byte order mark and keeps Bengali text", () => {
    const csv = toCsv(
      [
        { header: "নাম", kind: "text", value: (row: { name: string; amount: number }) => row.name },
        { header: "Amount", kind: "money", value: (row) => row.amount },
      ],
      [{ name: "শার্ট, সাদা", amount: 125_050 }],
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}নাম,Amount\r\n"শার্ট, সাদা",1250.50\r\n`);
  });

  it("writes taka with two decimals, including negatives", () => {
    expect(poishaToTaka(5)).toBe("0.05");
    expect(poishaToTaka(-8_000)).toBe("-80.00");
  });

  it("stops spreadsheet formulas in text cells", () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("+880 1711")).toBe("'+880 1711");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField(-500, "money")).toBe("-5.00");
  });

  it("streams page by page", async () => {
    async function* pages() {
      yield [{ n: 1 }, { n: 2 }];
      yield [{ n: 3 }];
    }
    const stream = csvStream(
      [{ header: "n", kind: "int", value: (row: { n: number }) => row.n }],
      pages(),
    );
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    // UTF-8 byte order mark first (Response.text() would strip it).
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(
      `${CSV_BOM}n\r\n1\r\n2\r\n3\r\n`,
    );
  });
});

describe("report settings", () => {
  it("defaults to the owner's values", () => {
    const settings = parseReportSettings(new Map());
    expect(settings).toMatchObject({ weekStartsOn: 6, staleShipmentDays: 5, codOverdueDays: 7 });
  });

  it("ignores an invalid stored value", () => {
    const warnings: string[] = [];
    const settings = parseReportSettings(new Map([["reports.weekStartsOn", "9"]]), (m) =>
      warnings.push(m),
    );
    expect(settings.weekStartsOn).toBe(6);
    expect(warnings).toHaveLength(1);
  });
});
