import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import {
  hasPermission,
  locationScope,
  restrictToAccessibleLocations,
  type StaffContext,
} from "@/modules/access/authorization";
import type { PermissionKey } from "@/modules/access/permissions";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { CANCEL_REASON_LABELS } from "@/modules/orders/order-labels";
import { COURIER_LABELS, type CourierKey } from "@/modules/settings/order-settings";
import { getReportSettings, type ReportSettings } from "@/modules/settings/settings.service";
import { poishaToTaka, type CsvColumn, type CsvColumnKind } from "./report-csv";
import {
  allocate,
  codAgeBucket,
  COD_AGE_BUCKETS,
  COD_AGE_LABELS,
  emptyFact,
  groupLines,
  groupTotals,
  lineTotals,
  percentOf,
  totalsOf,
  type Channel,
  type LineFact,
  type LineTotals,
  type SalesFact,
  type SalesTotals,
} from "./report-math";
import {
  ageInDays,
  bucketOf,
  bucketsIn,
  defaultBucket,
  dhakaDateKey,
  addDays,
  bucketLastDay,
  RANGE_PRESETS,
  resolveRange,
  type BucketUnit,
  type DateRange,
  type RangePreset,
} from "./report-time";
import * as repo from "./reports.repository";
import type { ReportScope, ReturnLineRow } from "./reports.repository";

export type { SoldOrderRow } from "./reports.repository";

/**
 * Reports (Phase 12). Every figure is computed on the server inside the
 * staff member's locations; purchase cost and profit are only ever built when
 * the staff member holds `inventory.cost.read`, so they cannot leak through a
 * response, a CSV or the page source.
 */

// ---------------------------------------------------------------------------
// catalogue of reports
// ---------------------------------------------------------------------------

export const REPORT_KEYS = [
  "sales",
  "products",
  "profit",
  "stock-value",
  "slow-stock",
  "cod",
  "coupons",
  "returns",
  "failed",
  "pos",
  "movements",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportDefinition {
  key: ReportKey;
  title: string;
  description: string;
  /** Permissions needed besides report.view. */
  requires: readonly PermissionKey[];
  filters: { range: boolean; channel: boolean; location: boolean; category: boolean };
}

const SALES_FILTERS = { range: true, channel: true, location: true, category: false };
const LINE_FILTERS = { range: true, channel: true, location: true, category: true };

export const REPORTS: readonly ReportDefinition[] = [
  {
    key: "sales",
    title: "Sales summary",
    description:
      "Gross, discounts, refunds and net sales by day, week or month; channels and branches.",
    requires: ["order.read"],
    filters: SALES_FILTERS,
  },
  {
    key: "products",
    title: "Products",
    description: "Best sellers by units and value; categories, sizes and colours.",
    requires: ["order.read"],
    filters: LINE_FILTERS,
  },
  {
    key: "profit",
    title: "Profit and margin",
    description: "Profit by product, category, branch and channel at the cost when sold.",
    requires: ["order.read", "inventory.cost.read"],
    filters: LINE_FILTERS,
  },
  {
    key: "stock-value",
    title: "Stock value",
    description: "Stock on hand per location at cost and at selling price; goods in transit.",
    requires: ["inventory.read"],
    filters: { range: false, channel: false, location: true, category: true },
  },
  {
    key: "slow-stock",
    title: "Slow stock",
    description: "Stock that has not sold for a number of days.",
    requires: ["inventory.read"],
    filters: { range: false, channel: false, location: true, category: true },
  },
  {
    key: "cod",
    title: "Cash on delivery",
    description: "Delivered COD not yet collected, by age and courier; settlement differences.",
    requires: ["order.read"],
    filters: { range: true, channel: false, location: true, category: false },
  },
  {
    key: "coupons",
    title: "Coupons",
    description: "Use, discount given and sales per coupon.",
    requires: ["order.read"],
    filters: SALES_FILTERS,
  },
  {
    key: "returns",
    title: "Returns and exchanges",
    description: "Reasons, products that come back, refunds by method.",
    requires: ["order.read"],
    filters: SALES_FILTERS,
  },
  {
    key: "failed",
    title: "Failed deliveries and cancellations",
    description:
      "Cancel reasons, fake orders, failed deliveries by district and zone, lost charges.",
    requires: ["order.read"],
    filters: SALES_FILTERS,
  },
  {
    key: "pos",
    title: "Till",
    description:
      "Z-reports, cash differences, payment methods, sales per staff, approved discounts.",
    requires: ["order.read"],
    filters: { range: true, channel: false, location: true, category: false },
  },
  {
    key: "movements",
    title: "Stock adjustments",
    description: "Adjustments, damage and count corrections by reason and staff.",
    requires: ["inventory.read"],
    filters: { range: true, channel: false, location: true, category: true },
  },
];

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}

export function reportDefinition(key: ReportKey): ReportDefinition {
  return REPORTS.find((report) => report.key === key)!;
}

export function canViewReport(staff: StaffContext, key: ReportKey): boolean {
  return (
    hasPermission(staff, "report.view") &&
    reportDefinition(key).requires.every((permission) => hasPermission(staff, permission))
  );
}

export function visibleReports(staff: StaffContext): ReportDefinition[] {
  return REPORTS.filter((report) => canViewReport(staff, report.key));
}

function assertCanView(staff: StaffContext, key: ReportKey) {
  if (!canViewReport(staff, key)) {
    throw new AppError("FORBIDDEN", "This report is not available to your role.", {
      messageKey: "errors.forbidden",
    });
  }
}

export function canSeeCost(staff: StaffContext): boolean {
  return hasPermission(staff, "inventory.cost.read");
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

const filterSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch("this_month"),
  from: z.string().max(10).optional().catch(undefined),
  to: z.string().max(10).optional().catch(undefined),
  channel: z.enum(["ONLINE", "STORE"]).nullable().catch(null),
  location: z.string().max(40).nullable().catch(null),
  category: z.string().max(40).nullable().catch(null),
  group: z.enum(["day", "week", "month"]).nullable().catch(null),
  days: z.coerce.number().int().min(7).max(730).nullable().catch(null),
});

export interface ReportFilters {
  range: DateRange;
  channel: Channel | null;
  locationId: string | null;
  categoryId: string | null;
  bucket: BucketUnit;
  /** Slow stock look-back. */
  days: number;
}

export function parseReportFilters(
  raw: Record<string, string | string[] | undefined>,
  settings: ReportSettings,
  now: Date,
  defaultPreset: RangePreset = "this_month",
): ReportFilters {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value === "" ? undefined : value;
  const parsed = filterSchema.parse({
    range: first(raw.range) ?? defaultPreset,
    from: first(raw.from),
    to: first(raw.to),
    channel: first(raw.channel) ?? null,
    location: first(raw.location) ?? null,
    category: first(raw.category) ?? null,
    group: first(raw.group) ?? null,
    days: first(raw.days) ?? null,
  });
  const range = resolveRange({
    preset: parsed.range,
    from: parsed.from ?? null,
    to: parsed.to ?? null,
    now,
    weekStartsOn: settings.weekStartsOn,
  });
  return {
    range,
    channel: parsed.channel,
    locationId: parsed.location,
    categoryId: parsed.category,
    bucket: parsed.group ?? defaultBucket(range),
    days: parsed.days ?? settings.slowStockDays,
  };
}

/** The filters back as query-string values (for links and the CSV button). */
export function filtersToQuery(filters: ReportFilters): Record<string, string> {
  const query: Record<string, string> = { range: filters.range.preset };
  if (filters.range.preset === "custom") {
    query.from = filters.range.fromKey;
    query.to = filters.range.toKey;
  }
  if (filters.channel !== null) query.channel = filters.channel;
  if (filters.locationId !== null) query.location = filters.locationId;
  if (filters.categoryId !== null) query.category = filters.categoryId;
  query.group = filters.bucket;
  query.days = String(filters.days);
  return query;
}

function locationIdsFor(staff: StaffContext, locationId: string | null) {
  if (locationId === null) return locationScope(staff);
  return restrictToAccessibleLocations(staff, [locationId]);
}

function scopeFor(staff: StaffContext, filters: ReportFilters): ReportScope {
  return {
    from: filters.range.from,
    to: filters.range.to,
    locationIds: locationIdsFor(staff, filters.locationId),
    channel: filters.channel,
  };
}

/** A category and every category below it. */
function categoryFamily(
  categories: ReadonlyArray<{ id: string; parentId: string | null }>,
  rootId: string,
): string[] {
  const result = [rootId];
  for (let index = 0; index < result.length; index += 1) {
    for (const category of categories) {
      if (category.parentId === result[index] && !result.includes(category.id)) {
        result.push(category.id);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// the shape every report page and CSV renders
// ---------------------------------------------------------------------------

export type CellValue = string | number | null;

export interface ReportColumn {
  key: string;
  header: string;
  kind: CsvColumnKind;
}

export interface ReportRow {
  cells: Record<string, CellValue>;
  /** Drill-down link for the row. */
  href?: string;
}

export interface ReportTable {
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: Record<string, CellValue>;
  note?: string;
}

export interface ReportKpi {
  label: string;
  value: number | null;
  kind: "money" | "int" | "percent";
  hint?: string;
  href?: string;
  tone?: "default" | "negative" | "warning";
}

export interface ChartSeries {
  key: string;
  label: string;
}

export interface ReportChart {
  title: string;
  /** Vertical columns over time, or horizontal bars over categories. */
  kind: "columns" | "bars";
  valueKind: "money" | "int";
  series: ChartSeries[];
  points: Array<{ label: string; values: number[]; href?: string }>;
}

export interface ReportResult {
  definition: ReportDefinition;
  filters: ReportFilters;
  kpis: ReportKpi[];
  chart: ReportChart | null;
  tables: ReportTable[];
  notes: string[];
}

export function tableCsvColumns(table: ReportTable): CsvColumn<ReportRow>[] {
  return table.columns.map((column) => ({
    header: column.header,
    kind: column.kind,
    value: (row) => row.cells[column.key] ?? null,
  }));
}

const money = (key: string, header: string): ReportColumn => ({ key, header, kind: "money" });
const int = (key: string, header: string): ReportColumn => ({ key, header, kind: "int" });
const text = (key: string, header: string): ReportColumn => ({ key, header, kind: "text" });
const pct = (key: string, header: string): ReportColumn => ({ key, header, kind: "percent" });

/** "SIZE_MISMATCH" -> "Size mismatch". */
export function humanize(code: string | null | undefined): string {
  if (code === null || code === undefined || code === "") return "—";
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function locationNames(ids?: readonly string[]) {
  const rows = await repo.reportLocations(ids);
  return new Map(rows.map((row) => [row.id, `${row.code} · ${row.nameEn}`]));
}

// ---------------------------------------------------------------------------
// sales facts (shared by the sales report, the dashboard and the tests)
// ---------------------------------------------------------------------------

export async function loadSalesFacts(scope: ReportScope): Promise<SalesFact[]> {
  const [sales, refunds, exchanges, deliveryReturns] = await Promise.all([
    repo.salesByDay(scope),
    repo.refundsByDay(scope),
    repo.exchangeCreditByDay(scope),
    repo.deliveryReturnsByDay(scope),
  ]);
  const facts = new Map<string, SalesFact>();
  const fact = (day: string, channel: Channel, locationId: string) => {
    const key = `${day}|${channel}|${locationId}`;
    let entry = facts.get(key);
    if (entry === undefined) {
      entry = emptyFact(day, channel, locationId);
      facts.set(key, entry);
    }
    return entry;
  };
  for (const row of sales) {
    const entry = fact(row.day, row.channel, row.locationId);
    entry.orders += row.orders;
    entry.grossPoisha += row.gross;
    entry.discountPoisha += row.discount;
    entry.shippingPoisha += row.shipping;
  }
  for (const row of refunds) {
    const entry = fact(row.day, row.channel, row.locationId);
    entry.refundGoodsPoisha += row.goods;
    entry.refundShippingPoisha += row.shipping;
    entry.tillRefundPoisha += row.atTill;
  }
  for (const row of exchanges) {
    fact(row.day, row.channel, row.locationId).exchangeCreditPoisha += row.amount;
  }
  for (const row of deliveryReturns) {
    const entry = fact(row.day, row.channel, row.locationId);
    entry.deliveryReturnOrders += row.count;
    entry.deliveryReturnGoodsPoisha += row.amount;
    entry.deliveryReturnShippingPoisha += row.shipping;
  }
  return [...facts.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Sales totals for a staff member and a period (dashboard and tests). */
export async function salesTotalsFor(
  staff: StaffContext,
  input: { from: Date; to: Date; locationId?: string | null; channel?: Channel | null },
): Promise<SalesTotals> {
  const facts = await loadSalesFacts({
    from: input.from,
    to: input.to,
    locationIds: locationIdsFor(staff, input.locationId ?? null),
    channel: input.channel ?? null,
  });
  return totalsOf(facts);
}

function salesColumns(): ReportColumn[] {
  return [
    int("orders", "Orders"),
    money("gross", "Gross"),
    money("discount", "Discount"),
    money("goods", "Goods sales"),
    money("refunds", "Refunds"),
    money("exchange", "Exchange credit"),
    money("deliveryReturns", "Delivery returns"),
    money("net", "Net sales"),
    money("delivery", "Delivery income"),
    money("average", "Average order"),
  ];
}

function salesCells(totals: SalesTotals): Record<string, CellValue> {
  return {
    orders: totals.orders,
    gross: totals.grossPoisha,
    discount: totals.discountPoisha,
    goods: totals.goodsSalesPoisha,
    refunds: totals.refundsPoisha,
    exchange: totals.exchangeCreditPoisha,
    deliveryReturns: totals.deliveryReturnsPoisha,
    net: totals.netSalesPoisha,
    delivery: totals.deliveryIncomePoisha,
    average: totals.averageOrderPoisha,
  };
}

function bucketLabel(key: string, unit: BucketUnit, weekStartsOn: number, toKey: string): string {
  if (unit === "day") return key;
  if (unit === "month") return key.slice(0, 7);
  const end = addDays(bucketOf(key, "week", weekStartsOn), 6);
  return `${key} – ${end < toKey ? end : toKey}`;
}

function bucketEnd(key: string, unit: BucketUnit, toKey: string): string {
  const end = bucketLastDay(key, unit);
  return end < toKey ? end : toKey;
}

export function ordersDrillDown(
  fromKey: string,
  toKey: string,
  extra: Record<string, string> = {},
) {
  const query = new URLSearchParams({ tab: "all", soldFrom: fromKey, soldTo: toKey, ...extra });
  return `/admin/orders?${query.toString()}`;
}

async function salesReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const settings = await getReportSettings();
  const scope = scopeFor(staff, filters);
  const facts = await loadSalesFacts(scope);
  const totals = totalsOf(facts);
  const names = await locationNames();
  const buckets = bucketsIn(filters.range, filters.bucket, settings.weekStartsOn);
  const byBucket = groupTotals(facts, (fact) =>
    bucketOf(fact.day, filters.bucket, settings.weekStartsOn),
  );
  const byBucketChannel = groupTotals(
    facts,
    (fact) => `${bucketOf(fact.day, filters.bucket, settings.weekStartsOn)}|${fact.channel}`,
  );
  const empty = totalsOf([]);

  const periodRows: ReportRow[] = buckets.map((key) => {
    const from = key < filters.range.fromKey ? filters.range.fromKey : key;
    const to = bucketEnd(key, filters.bucket, filters.range.toKey);
    return {
      cells: {
        period: bucketLabel(from, filters.bucket, settings.weekStartsOn, filters.range.toKey),
        ...salesCells(byBucket.get(key) ?? empty),
      },
      href: ordersDrillDown(from, to),
    };
  });

  const channelRows: ReportRow[] = [...groupTotals(facts, (fact) => fact.channel)].map(
    ([channel, value]) => ({
      cells: { channel: channel === "ONLINE" ? "Online" : "In store", ...salesCells(value) },
      ...(channel === "ONLINE"
        ? { href: ordersDrillDown(filters.range.fromKey, filters.range.toKey) }
        : {}),
    }),
  );
  const locationRows: ReportRow[] = [...groupTotals(facts, (fact) => fact.locationId)]
    .map(([locationId, value]): ReportRow => ({
      cells: { location: names.get(locationId) ?? locationId, ...salesCells(value) },
    }))
    .sort((a, b) => Number(b.cells.net) - Number(a.cells.net));

  return {
    definition: reportDefinition("sales"),
    filters,
    kpis: [
      { label: "Net sales", value: totals.netSalesPoisha, kind: "money" },
      { label: "Goods sales", value: totals.goodsSalesPoisha, kind: "money" },
      { label: "Orders", value: totals.orders, kind: "int" },
      { label: "Average order", value: totals.averageOrderPoisha, kind: "money" },
      {
        label: "Refunds, exchanges and delivery returns",
        value: totals.refundsPoisha + totals.exchangeCreditPoisha + totals.deliveryReturnsPoisha,
        kind: "money",
        tone: "negative",
      },
      { label: "Delivery income", value: totals.deliveryIncomePoisha, kind: "money" },
    ],
    chart: {
      title: "Net sales",
      kind: "columns",
      valueKind: "money",
      series: [
        { key: "ONLINE", label: "Online" },
        { key: "STORE", label: "In store" },
      ],
      points: buckets.map((key) => ({
        label: bucketLabel(
          key < filters.range.fromKey ? filters.range.fromKey : key,
          filters.bucket,
          settings.weekStartsOn,
          filters.range.toKey,
        ),
        values: (["ONLINE", "STORE"] as const).map(
          (channel) => byBucketChannel.get(`${key}|${channel}`)?.netSalesPoisha ?? 0,
        ),
      })),
    },
    tables: [
      {
        id: "periods",
        title: `By ${filters.bucket}`,
        columns: [text("period", filters.bucket === "day" ? "Day" : "Period"), ...salesColumns()],
        rows: periodRows,
        totals: { period: "Total", ...salesCells(totals) },
      },
      {
        id: "channels",
        title: "By channel",
        columns: [text("channel", "Channel"), ...salesColumns()],
        rows: channelRows,
      },
      {
        id: "locations",
        title: "By branch or warehouse",
        columns: [text("location", "Location"), ...salesColumns()],
        rows: locationRows,
      },
    ],
    notes: [
      "An online order counts as sold when it is first shipped (the invoice date); a till sale when it is rung up. Cancelled orders never count.",
      "Refunds count on the day they are completed; exchange credit on the day the exchange order is shipped; delivery returns on the day the parcel is back in the warehouse.",
      `Refunds paid from a till drawer: ৳${poishaToTaka(totals.refundsAtTillPoisha)}; paid another way: ৳${poishaToTaka(totals.refundsElsewherePoisha)} (both include any delivery-charge refunds). Till refunds match the Z-reports.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// line facts (products, profit)
// ---------------------------------------------------------------------------

function returnFact(
  line: ReturnLineRow,
  order: { channel: Channel; locationId: string },
  quantity: number,
  value: number,
  restocked: boolean,
): LineFact {
  const costKnown = line.unitCostPoisha !== null;
  return {
    variantId: line.variantId,
    sku: line.sku,
    productName: line.productNameEn,
    size: line.sizeLabelEn,
    colour: line.colourLabelEn,
    channel: order.channel,
    locationId: order.locationId,
    costKnown,
    soldQty: 0,
    grossPoisha: 0,
    discountPoisha: 0,
    returnedQty: quantity,
    returnedPoisha: value,
    // Units back on the shelf give their cost back; written-off units do not.
    costPoisha: costKnown && restocked ? -(line.unitCostPoisha! * quantity) : 0,
  };
}

export interface LineFactSet {
  facts: LineFact[];
  /** Goods refunds not tied to returned items (goodwill, price adjustments). */
  unattributedRefundPoisha: number;
}

export async function loadLineFacts(scope: ReportScope): Promise<LineFactSet> {
  const [sold, refunds, exchanges, deliveryReturns] = await Promise.all([
    repo.soldLines(scope),
    repo.refundsWithItems(scope),
    repo.exchangesWithItems(scope),
    repo.deliveryReturnsWithItems(scope),
  ]);
  const facts: LineFact[] = sold.map((row) => ({
    variantId: row.variantId,
    sku: row.sku,
    productName: row.productName,
    size: row.size,
    colour: row.colour,
    channel: row.channel,
    locationId: row.locationId,
    costKnown: row.costKnown,
    soldQty: row.qty,
    grossPoisha: row.gross,
    discountPoisha: row.discount,
    returnedQty: 0,
    returnedPoisha: 0,
    costPoisha: row.cost,
  }));
  let unattributed = 0;
  for (const refund of refunds) {
    const goods = refund.amountPoisha - refund.shippingRefundPoisha;
    const items = refund.returnRequest?.items ?? [];
    if (items.length === 0) {
      unattributed += goods;
      continue;
    }
    const shares = allocate(
      goods,
      items.map((item) => item.creditPoisha),
    );
    items.forEach((item, index) =>
      facts.push(
        returnFact(
          item.orderItem,
          refund.order,
          item.quantity,
          shares[index]!,
          item.restockLocationId !== null,
        ),
      ),
    );
  }
  for (const order of exchanges) {
    const credit = order.payments.reduce((sum, payment) => sum + payment.amountPoisha, 0);
    const items = order.exchangeFor?.items ?? [];
    if (credit === 0 || items.length === 0) continue;
    const shares = allocate(
      credit,
      items.map((item) => item.creditPoisha),
    );
    items.forEach((item, index) =>
      facts.push(
        returnFact(
          item.orderItem,
          order,
          item.quantity,
          shares[index]!,
          item.restockLocationId !== null,
        ),
      ),
    );
  }
  for (const order of deliveryReturns) {
    for (const item of order.items) {
      facts.push(
        returnFact(item, order, item.quantity, item.lineTotalPoisha - item.discountPoisha, true),
      );
    }
  }
  return { facts, unattributedRefundPoisha: unattributed };
}

interface VariantInfo {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
}

async function variantInfo(facts: readonly LineFact[]): Promise<Map<string, VariantInfo>> {
  const ids = [
    ...new Set(facts.flatMap((fact) => (fact.variantId === null ? [] : [fact.variantId]))),
  ];
  const rows = await repo.variantCatalogue(ids);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        productId: row.product.id,
        productName: row.product.nameEn,
        categoryId: row.product.category.id,
        categoryName: row.product.category.nameEn,
      },
    ]),
  );
}

async function filteredLineFacts(staff: StaffContext, filters: ReportFilters) {
  const set = await loadLineFacts(scopeFor(staff, filters));
  const info = await variantInfo(set.facts);
  let facts = set.facts;
  if (filters.categoryId !== null) {
    const family = new Set(categoryFamily(await repo.reportCategories(), filters.categoryId));
    facts = facts.filter((fact) => {
      const entry = fact.variantId === null ? undefined : info.get(fact.variantId);
      return entry !== undefined && family.has(entry.categoryId);
    });
  }
  return { facts, info, unattributedRefundPoisha: set.unattributedRefundPoisha };
}

function productKey(fact: LineFact, info: Map<string, VariantInfo>) {
  const entry = fact.variantId === null ? undefined : info.get(fact.variantId);
  return entry?.productId ?? `name:${fact.productName}`;
}

function productLabel(key: string, info: Map<string, VariantInfo>) {
  if (key.startsWith("name:")) return key.slice(5);
  for (const entry of info.values()) if (entry.productId === key) return entry.productName;
  return key;
}

function categoryOf(fact: LineFact, info: Map<string, VariantInfo>) {
  const entry = fact.variantId === null ? undefined : info.get(fact.variantId);
  return entry?.categoryName ?? "Unknown";
}

function lineCells(totals: LineTotals): Record<string, CellValue> {
  return {
    sold: totals.soldQty,
    returned: totals.returnedQty,
    gross: totals.grossPoisha,
    discount: totals.discountPoisha,
    net: totals.netPoisha,
    returnRate: percentOf(totals.returnedQty, totals.soldQty),
  };
}

const LINE_COLUMNS: ReportColumn[] = [
  int("sold", "Units sold"),
  int("returned", "Units back"),
  pct("returnRate", "Back %"),
  money("gross", "Gross"),
  money("discount", "Discount"),
  money("net", "Net"),
];

function sortedRows(
  groups: Map<string, LineTotals>,
  label: (key: string) => Record<string, CellValue>,
  by: (totals: LineTotals) => number,
  limit: number,
  cells: (totals: LineTotals) => Record<string, CellValue> = lineCells,
): ReportRow[] {
  return [...groups]
    .sort((a, b) => by(b[1]) - by(a[1]))
    .slice(0, limit)
    .map(([key, totals]) => ({ cells: { ...label(key), ...cells(totals) } }));
}

async function productsReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const { facts, info } = await filteredLineFacts(staff, filters);
  const totals = lineTotals(facts);
  const byProduct = groupLines(facts, (fact) => productKey(fact, info));
  const byVariant = groupLines(facts, (fact) => fact.sku);
  const variantMeta = new Map(facts.map((fact) => [fact.sku, fact]));
  const byCategory = groupLines(facts, (fact) => categoryOf(fact, info));
  const bySize = groupLines(facts, (fact) => fact.size ?? "—");
  const byColour = groupLines(facts, (fact) => fact.colour ?? "—");
  const top = [...byProduct].sort((a, b) => b[1].netPoisha - a[1].netPoisha).slice(0, 10);

  return {
    definition: reportDefinition("products"),
    filters,
    kpis: [
      { label: "Units sold", value: totals.soldQty, kind: "int" },
      { label: "Units back", value: totals.returnedQty, kind: "int", tone: "negative" },
      { label: "Net goods sales", value: totals.netPoisha, kind: "money" },
      { label: "Products sold", value: byProduct.size, kind: "int" },
    ],
    chart: {
      title: "Top products by net sales",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "net", label: "Net sales" }],
      points: top.map(([key, value]) => ({
        label: productLabel(key, info),
        values: [value.netPoisha],
      })),
    },
    tables: [
      {
        id: "products",
        title: "Products",
        columns: [text("product", "Product"), ...LINE_COLUMNS],
        rows: sortedRows(
          byProduct,
          (key) => ({ product: productLabel(key, info) }),
          (t) => t.netPoisha,
          200,
        ),
        totals: { product: "Total", ...lineCells(totals) },
      },
      {
        id: "variants",
        title: "Variants",
        columns: [
          text("sku", "SKU"),
          text("product", "Product"),
          text("size", "Size"),
          text("colour", "Colour"),
          ...LINE_COLUMNS,
        ],
        rows: sortedRows(
          byVariant,
          (sku) => {
            const meta = variantMeta.get(sku);
            return {
              sku,
              product: meta?.productName ?? "",
              size: meta?.size ?? "—",
              colour: meta?.colour ?? "—",
            };
          },
          (t) => t.soldQty,
          300,
        ),
      },
      {
        id: "categories",
        title: "Categories",
        columns: [text("category", "Category"), ...LINE_COLUMNS],
        rows: sortedRows(
          byCategory,
          (key) => ({ category: key }),
          (t) => t.netPoisha,
          100,
        ),
      },
      {
        id: "sizes",
        title: "Sizes",
        columns: [text("size", "Size"), ...LINE_COLUMNS],
        rows: sortedRows(
          bySize,
          (key) => ({ size: key }),
          (t) => t.soldQty,
          100,
        ),
        note: "A high “Back %” for one size often means the size runs small or large.",
      },
      {
        id: "colours",
        title: "Colours",
        columns: [text("colour", "Colour"), ...LINE_COLUMNS],
        rows: sortedRows(
          byColour,
          (key) => ({ colour: key }),
          (t) => t.soldQty,
          100,
        ),
      },
    ],
    notes: [
      "Units back are returns, exchanges and failed deliveries in the period, counted against the line they were sold on.",
    ],
  };
}

const PROFIT_COLUMNS: ReportColumn[] = [
  int("sold", "Units sold"),
  money("net", "Net sales"),
  money("cost", "Cost"),
  money("profit", "Profit"),
  pct("margin", "Margin %"),
  money("unknown", "Sales with unknown cost"),
];

function profitCells(totals: LineTotals): Record<string, CellValue> {
  return {
    sold: totals.soldQty,
    net: totals.knownNetPoisha,
    cost: totals.costPoisha,
    profit: totals.profitPoisha,
    margin: totals.marginPercent,
    unknown: totals.unknownCostNetPoisha,
  };
}

async function profitReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const { facts, info, unattributedRefundPoisha } = await filteredLineFacts(staff, filters);
  const names = await locationNames();
  const totals = lineTotals(facts);
  const byProduct = groupLines(facts, (fact) => productKey(fact, info));
  const byCategory = groupLines(facts, (fact) => categoryOf(fact, info));
  const byLocation = groupLines(facts, (fact) => fact.locationId);
  const byChannel = groupLines(facts, (fact) => fact.channel);
  const profitOf = (t: LineTotals) => t.profitPoisha ?? Number.NEGATIVE_INFINITY;

  return {
    definition: reportDefinition("profit"),
    filters,
    kpis: [
      { label: "Profit", value: totals.profitPoisha, kind: "money" },
      { label: "Margin", value: totals.marginPercent, kind: "percent" },
      { label: "Net sales (cost known)", value: totals.knownNetPoisha, kind: "money" },
      { label: "Cost of goods", value: totals.costPoisha, kind: "money" },
      {
        label: "Sales with unknown cost",
        value: totals.unknownCostNetPoisha,
        kind: "money",
        tone: totals.unknownCostNetPoisha === 0 ? "default" : "warning",
        hint: "Sold before purchase costs were recorded at the sale — not guessed.",
      },
      {
        label: "Refunds not tied to an item",
        value: unattributedRefundPoisha,
        kind: "money",
        tone: unattributedRefundPoisha === 0 ? "default" : "warning",
        hint: "Not in the profit above.",
      },
    ],
    chart: {
      title: "Profit by category",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "profit", label: "Profit" }],
      points: [...byCategory]
        .filter(([, value]) => value.profitPoisha !== null)
        .sort((a, b) => profitOf(b[1]) - profitOf(a[1]))
        .slice(0, 10)
        .map(([key, value]) => ({ label: key, values: [value.profitPoisha ?? 0] })),
    },
    tables: [
      {
        id: "products",
        title: "Products",
        columns: [text("product", "Product"), ...PROFIT_COLUMNS],
        rows: sortedRows(
          byProduct,
          (key) => ({ product: productLabel(key, info) }),
          profitOf,
          200,
          profitCells,
        ),
        totals: { product: "Total", ...profitCells(totals) },
      },
      {
        id: "categories",
        title: "Categories",
        columns: [text("category", "Category"), ...PROFIT_COLUMNS],
        rows: sortedRows(byCategory, (key) => ({ category: key }), profitOf, 100, profitCells),
      },
      {
        id: "locations",
        title: "Branches and warehouses",
        columns: [text("location", "Location"), ...PROFIT_COLUMNS],
        rows: sortedRows(
          byLocation,
          (key) => ({ location: names.get(key) ?? key }),
          profitOf,
          100,
          profitCells,
        ),
      },
      {
        id: "channels",
        title: "Channels",
        columns: [text("channel", "Channel"), ...PROFIT_COLUMNS],
        rows: sortedRows(
          byChannel,
          (key) => ({ channel: key === "ONLINE" ? "Online" : "In store" }),
          profitOf,
          10,
          profitCells,
        ),
      },
    ],
    notes: [
      "Cost is the weighted average purchase cost at the moment each line was sold.",
      "Items that came back to stock give their cost back; written-off items do not.",
      "Delivery income is not part of profit here.",
    ],
  };
}

// ---------------------------------------------------------------------------
// stock value and slow stock
// ---------------------------------------------------------------------------

async function categoryIdsFor(filters: ReportFilters) {
  if (filters.categoryId === null) return null;
  return categoryFamily(await repo.reportCategories(), filters.categoryId);
}

async function stockValueReport(
  staff: StaffContext,
  filters: ReportFilters,
): Promise<ReportResult> {
  const showCost = canSeeCost(staff);
  const ids = locationIdsFor(staff, filters.locationId);
  const categoryIds = await categoryIdsFor(filters);
  const [onHand, inTransit, names] = await Promise.all([
    repo.stockValueByLocation(ids, categoryIds),
    repo.inTransitByDestination(ids, categoryIds),
    locationNames(),
  ]);
  const columns: ReportColumn[] = [
    text("location", "Location"),
    int("units", "Units"),
    ...(showCost ? [money("cost", "Value at cost"), int("noCost", "Units without cost")] : []),
    money("retail", "Value at selling price"),
  ];
  const cells = (row: repo.RawStockValueRow, label: string): Record<string, CellValue> => ({
    location: label,
    units: row.units,
    ...(showCost ? { cost: row.costValue, noCost: row.unitsWithoutCost } : {}),
    retail: row.retailValue,
  });
  const sum = (rows: readonly repo.RawStockValueRow[]): repo.RawStockValueRow => ({
    locationId: "",
    units: rows.reduce((total, row) => total + row.units, 0),
    unitsWithoutCost: rows.reduce((total, row) => total + row.unitsWithoutCost, 0),
    costValue: rows.reduce((total, row) => total + row.costValue, 0),
    retailValue: rows.reduce((total, row) => total + row.retailValue, 0),
  });
  const shelf = sum(onHand);
  const transit = sum(inTransit);
  return {
    definition: reportDefinition("stock-value"),
    filters,
    kpis: [
      { label: "Units on hand", value: shelf.units, kind: "int" },
      ...(showCost
        ? [{ label: "Value at cost", value: shelf.costValue, kind: "money" as const }]
        : []),
      { label: "Value at selling price", value: shelf.retailValue, kind: "money" },
      { label: "Units in transit", value: transit.units, kind: "int" },
    ],
    chart: {
      title: "Value at selling price by location",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "retail", label: "Selling price" }],
      points: onHand
        .slice()
        .sort((a, b) => b.retailValue - a.retailValue)
        .map((row) => ({
          label: names.get(row.locationId) ?? row.locationId,
          values: [row.retailValue],
        })),
    },
    tables: [
      {
        id: "on-hand",
        title: "On hand",
        columns,
        rows: onHand
          .map((row) => ({ cells: cells(row, names.get(row.locationId) ?? row.locationId) }))
          .sort((a, b) => Number(b.cells.retail) - Number(a.cells.retail)),
        totals: cells(shelf, "Total"),
      },
      {
        id: "in-transit",
        title: "In transit (dispatched, not yet received) — by destination",
        columns,
        rows: inTransit.map((row) => ({
          cells: cells(row, names.get(row.locationId) ?? row.locationId),
        })),
        totals: cells(transit, "Total"),
      },
    ],
    notes: showCost
      ? [
          "Value at cost uses each variant's current weighted average cost.",
          "Units without a cost are counted in units but not in the value at cost.",
        ]
      : [],
  };
}

async function slowStockReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const showCost = canSeeCost(staff);
  const now = new Date();
  const since = new Date(now.getTime() - filters.days * 24 * 60 * 60 * 1000);
  const [rows, names] = await Promise.all([
    repo.slowStock(
      locationIdsFor(staff, filters.locationId),
      await categoryIdsFor(filters),
      since,
      1000,
    ),
    locationNames(),
  ]);
  const units = rows.reduce((sum, row) => sum + row.onHand, 0);
  const retail = rows.reduce((sum, row) => sum + row.onHand * row.pricePoisha, 0);
  const cost = rows.reduce((sum, row) => sum + row.onHand * (row.costPoisha ?? 0), 0);
  return {
    definition: reportDefinition("slow-stock"),
    filters,
    kpis: [
      { label: "Variants", value: rows.length, kind: "int" },
      { label: "Units", value: units, kind: "int" },
      ...(showCost ? [{ label: "Value at cost", value: cost, kind: "money" as const }] : []),
      { label: "Value at selling price", value: retail, kind: "money" },
    ],
    chart: null,
    tables: [
      {
        id: "slow",
        title: `No sale in the last ${filters.days} days`,
        columns: [
          text("sku", "SKU"),
          text("product", "Product"),
          text("variant", "Variant"),
          text("location", "Location"),
          int("onHand", "On hand"),
          text("lastSale", "Last sale"),
          text("since", "In stock since"),
          ...(showCost ? [money("cost", "Value at cost")] : []),
          money("retail", "Value at selling price"),
        ],
        rows: rows.map((row) => ({
          cells: {
            sku: row.sku,
            product: row.productName,
            variant: row.label ?? "",
            location: names.get(row.locationId) ?? row.locationId,
            onHand: row.onHand,
            lastSale: row.lastSaleAt === null ? "Never" : dhakaDateKey(row.lastSaleAt),
            since: row.stockedSince === null ? "—" : dhakaDateKey(row.stockedSince),
            ...(showCost
              ? { cost: row.costPoisha === null ? null : row.costPoisha * row.onHand }
              : {}),
            retail: row.pricePoisha * row.onHand,
          },
          href: `/admin/inventory/${row.variantId}`,
        })),
      },
    ],
    notes: ["Shows at most 1,000 rows, oldest last sale first."],
  };
}

// ---------------------------------------------------------------------------
// COD
// ---------------------------------------------------------------------------

function courierText(shipment: { courier: string; courierName: string | null } | undefined) {
  if (shipment === undefined) return "—";
  return shipment.courierName ?? COURIER_LABELS[shipment.courier as CourierKey] ?? shipment.courier;
}

async function codReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const ids = locationIdsFor(staff, filters.locationId);
  const now = new Date();
  const [orders, settlements] = await Promise.all([
    repo.uncollectedCod(ids),
    repo.codSettlementsInRange(filters.range.from, filters.range.to, ids),
  ]);
  const open = orders
    .filter((order) => order.paidPoisha < order.totalPoisha)
    .map((order) => {
      const age = ageInDays(order.deliveredAt!, now);
      return {
        order,
        owed: order.totalPoisha - order.paidPoisha,
        age,
        bucket: codAgeBucket(age),
        courier: courierText(order.shipments[0]),
      };
    });
  const owed = open.reduce((sum, row) => sum + row.owed, 0);
  const byBucket = COD_AGE_BUCKETS.map((bucket) => {
    const rows = open.filter((row) => row.bucket === bucket);
    return { bucket, count: rows.length, owed: rows.reduce((sum, row) => sum + row.owed, 0) };
  });
  const couriers = new Map<string, { count: number; owed: number }>();
  for (const row of open) {
    const entry = couriers.get(row.courier) ?? { count: 0, owed: 0 };
    entry.count += 1;
    entry.owed += row.owed;
    couriers.set(row.courier, entry);
  }
  const settlementRows = new Map<
    string,
    { courier: string; receivedOn: string; expected: number; received: number; charge: number }
  >();
  for (const item of settlements) {
    const key = item.settlement.reference;
    const entry = settlementRows.get(key) ?? {
      courier: courierText(item.settlement),
      receivedOn: item.settlement.receivedOn.toISOString().slice(0, 10),
      expected: 0,
      received: 0,
      charge: item.settlement.courierChargePoisha,
    };
    entry.expected += item.expectedPoisha;
    entry.received += item.receivedPoisha;
    settlementRows.set(key, entry);
  }
  return {
    definition: reportDefinition("cod"),
    filters,
    kpis: [
      {
        label: "Still to collect",
        value: owed,
        kind: "money",
        tone: owed > 0 ? "warning" : "default",
      },
      { label: "Orders", value: open.length, kind: "int" },
      ...byBucket.map((entry) => ({
        label: COD_AGE_LABELS[entry.bucket],
        value: entry.owed,
        kind: "money" as const,
        ...(entry.bucket === "15+" && entry.owed > 0 ? { tone: "negative" as const } : {}),
      })),
    ],
    chart: {
      title: "Uncollected COD by age",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "owed", label: "Owed" }],
      points: byBucket.map((entry) => ({
        label: COD_AGE_LABELS[entry.bucket],
        values: [entry.owed],
      })),
    },
    tables: [
      {
        id: "ages",
        title: "By age (days since delivery)",
        columns: [text("age", "Age"), int("orders", "Orders"), money("owed", "Owed")],
        rows: byBucket.map((entry) => ({
          cells: { age: COD_AGE_LABELS[entry.bucket], orders: entry.count, owed: entry.owed },
        })),
        totals: { age: "Total", orders: open.length, owed },
      },
      {
        id: "couriers",
        title: "By courier",
        columns: [text("courier", "Courier"), int("orders", "Orders"), money("owed", "Owed")],
        rows: [...couriers].map(([courier, entry]) => ({
          cells: { courier, orders: entry.count, owed: entry.owed },
        })),
      },
      {
        id: "orders",
        title: "Orders",
        columns: [
          text("order", "Order"),
          text("courier", "Courier"),
          text("delivered", "Delivered"),
          int("age", "Days"),
          money("total", "Total"),
          money("paid", "Collected"),
          money("owed", "Owed"),
        ],
        rows: open
          .sort((a, b) => b.age - a.age)
          .slice(0, 500)
          .map((row) => ({
            cells: {
              order: row.order.orderNumber,
              courier: row.courier,
              delivered: dhakaDateKey(row.order.deliveredAt!),
              age: row.age,
              total: row.order.totalPoisha,
              paid: row.order.paidPoisha,
              owed: row.owed,
            },
            href: `/admin/orders/${row.order.id}`,
          })),
      },
      {
        id: "settlements",
        title: "Courier settlements recorded in the period",
        columns: [
          text("reference", "Settlement"),
          text("courier", "Courier"),
          text("receivedOn", "Received on"),
          money("expected", "Expected"),
          money("received", "Received"),
          money("difference", "Difference"),
          money("charge", "Courier charge"),
        ],
        rows: [...settlementRows].map(([reference, entry]) => ({
          cells: {
            reference,
            courier: entry.courier,
            receivedOn: entry.receivedOn,
            expected: entry.expected,
            received: entry.received,
            difference: entry.received - entry.expected,
            charge: entry.charge,
          },
        })),
      },
    ],
    notes: ["Uncollected COD is as of now; the date range applies to settlements only."],
  };
}

// ---------------------------------------------------------------------------
// coupons, returns, failed deliveries
// ---------------------------------------------------------------------------

async function couponsReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const rows = await repo.couponUsage(scopeFor(staff, filters));
  const discount = rows.reduce((sum, row) => sum + row.discount, 0);
  const goods = rows.reduce((sum, row) => sum + row.goods, 0);
  const orders = rows.reduce((sum, row) => sum + row.orders, 0);
  return {
    definition: reportDefinition("coupons"),
    filters,
    kpis: [
      { label: "Orders with a coupon", value: orders, kind: "int" },
      { label: "Coupon discount", value: discount, kind: "money" },
      { label: "Goods sales of those orders", value: goods, kind: "money" },
    ],
    chart: {
      title: "Discount given per coupon",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "discount", label: "Discount" }],
      points: rows.slice(0, 10).map((row) => ({ label: row.code, values: [row.discount] })),
    },
    tables: [
      {
        id: "coupons",
        title: "Coupons",
        columns: [
          text("code", "Coupon"),
          int("orders", "Orders"),
          money("discount", "Coupon discount"),
          money("gross", "Gross"),
          money("goods", "Goods sales"),
        ],
        rows: rows.map((row) => ({
          cells: { ...row },
          href: ordersDrillDown(filters.range.fromKey, filters.range.toKey, { coupon: row.code }),
        })),
        totals: { code: "Total", orders, discount, goods },
      },
    ],
    notes: ["Coupon discount excludes discounts typed at the till."],
  };
}

async function returnsReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const scope = scopeFor(staff, filters);
  const [requests, refunds] = await Promise.all([
    repo.returnRequestsInRange(scope),
    repo.completedRefundsByMethod(scope),
  ]);
  const reasons = new Map<string, { requests: number; units: number; credit: number }>();
  const products = new Map<
    string,
    { product: string; units: number; sizeUnits: number; requests: number }
  >();
  let exchanges = 0;
  for (const request of requests) {
    if (request.type === "EXCHANGE") exchanges += 1;
    const reason = humanize(request.reasonCode);
    const entry = reasons.get(reason) ?? { requests: 0, units: 0, credit: 0 };
    entry.requests += 1;
    for (const item of request.items) {
      entry.units += item.quantity;
      entry.credit += item.creditPoisha;
      const key = item.orderItem.productNameEn;
      const product = products.get(key) ?? { product: key, units: 0, sizeUnits: 0, requests: 0 };
      product.units += item.quantity;
      if (request.reasonCode === "SIZE_MISMATCH") product.sizeUnits += item.quantity;
      products.set(key, product);
    }
    reasons.set(reason, entry);
  }
  for (const request of requests) {
    for (const key of new Set(request.items.map((item) => item.orderItem.productNameEn))) {
      products.get(key)!.requests += 1;
    }
  }
  const refunded = refunds.reduce((sum, row) => sum + row.amount, 0);
  return {
    definition: reportDefinition("returns"),
    filters,
    kpis: [
      { label: "Requests", value: requests.length, kind: "int" },
      { label: "Of which exchanges", value: exchanges, kind: "int" },
      { label: "Refunded (completed)", value: refunded, kind: "money", tone: "negative" },
    ],
    chart: {
      title: "Requests by reason",
      kind: "bars",
      valueKind: "int",
      series: [{ key: "requests", label: "Requests" }],
      points: [...reasons].map(([reason, entry]) => ({ label: reason, values: [entry.requests] })),
    },
    tables: [
      {
        id: "reasons",
        title: "By reason",
        columns: [
          text("reason", "Reason"),
          int("requests", "Requests"),
          int("units", "Units"),
          money("credit", "Credit value"),
        ],
        rows: [...reasons].map(([reason, entry]) => ({ cells: { reason, ...entry } })),
      },
      {
        id: "products",
        title: "Products that come back",
        columns: [
          text("product", "Product"),
          int("requests", "Requests"),
          int("units", "Units"),
          int("sizeUnits", "Units for size"),
        ],
        rows: [...products.values()]
          .sort((a, b) => b.units - a.units)
          .slice(0, 200)
          .map((entry) => ({ cells: { ...entry } })),
        note: "“Units for size” are returns with the reason Size mismatch.",
      },
      {
        id: "refunds",
        title: "Refunds completed, by method",
        columns: [text("method", "Method"), int("count", "Refunds"), money("amount", "Amount")],
        rows: refunds.map((row) => ({
          cells: { method: humanize(row.method), count: row.count, amount: row.amount },
        })),
        totals: {
          method: "Total",
          count: refunds.reduce((s, r) => s + r.count, 0),
          amount: refunded,
        },
      },
    ],
    notes: [
      "Requests are counted on the day they were opened; refunds on the day they were completed.",
    ],
  };
}

async function failedReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const scope = scopeFor(staff, filters);
  const [cancelled, failed] = await Promise.all([
    repo.cancelledInRange(scope),
    repo.failedDeliveriesInRange(scope),
  ]);
  const inRange = (date: Date | null) =>
    date !== null && date >= filters.range.from && date < filters.range.to;
  const cancelReasons = new Map<string, { orders: number; value: number }>();
  for (const order of cancelled) {
    const reason =
      order.cancelReason === null
        ? "—"
        : (CANCEL_REASON_LABELS[order.cancelReason as keyof typeof CANCEL_REASON_LABELS] ??
          humanize(order.cancelReason));
    const entry = cancelReasons.get(reason) ?? { orders: 0, value: 0 };
    entry.orders += 1;
    entry.value += order.totalPoisha;
    cancelReasons.set(reason, entry);
  }
  const failures = failed.filter((order) => inRange(order.deliveryFailedAt));
  const backToWarehouse = failed.filter((order) => inRange(order.returnedToWarehouseAt));
  const failReasons = new Map<string, number>();
  const districts = new Map<string, { failed: number; returned: number }>();
  const zones = new Map<string, { failed: number; returned: number }>();
  for (const order of failures) {
    const reason = order.deliveryFailedReason?.trim() || "—";
    failReasons.set(reason, (failReasons.get(reason) ?? 0) + 1);
  }
  const bump = (
    map: Map<string, { failed: number; returned: number }>,
    key: string,
    field: "failed" | "returned",
  ) => {
    const entry = map.get(key) ?? { failed: 0, returned: 0 };
    entry[field] += 1;
    map.set(key, entry);
  };
  for (const order of failures) {
    bump(districts, order.shipDistrictName ?? "—", "failed");
    bump(zones, order.zoneName ?? "—", "failed");
  }
  for (const order of backToWarehouse) {
    bump(districts, order.shipDistrictName ?? "—", "returned");
    bump(zones, order.zoneName ?? "—", "returned");
  }
  const unearned = backToWarehouse.reduce((sum, order) => sum + order.shippingPoisha, 0);
  const courierCharges = backToWarehouse.reduce(
    (sum, order) => sum + order.shipments.reduce((s, shipment) => s + shipment.lostChargePoisha, 0),
    0,
  );
  const fake = cancelled.filter((order) => order.cancelReason === "FAKE_ORDER").length;
  const placeColumns = (label: string): ReportColumn[] => [
    text("place", label),
    int("failed", "Failed attempts"),
    int("returned", "Back to warehouse"),
  ];
  const placeRows = (map: Map<string, { failed: number; returned: number }>) =>
    [...map]
      .sort((a, b) => b[1].failed + b[1].returned - (a[1].failed + a[1].returned))
      .map(([place, entry]) => ({ cells: { place, ...entry } }));
  return {
    definition: reportDefinition("failed"),
    filters,
    kpis: [
      { label: "Cancelled orders", value: cancelled.length, kind: "int" },
      { label: "Fake orders", value: fake, kind: "int", tone: fake > 0 ? "warning" : "default" },
      { label: "Failed delivery attempts", value: failures.length, kind: "int" },
      { label: "Back to warehouse", value: backToWarehouse.length, kind: "int" },
      { label: "Delivery charge not earned", value: unearned, kind: "money", tone: "negative" },
      { label: "Courier return charges", value: courierCharges, kind: "money", tone: "negative" },
    ],
    chart: {
      title: "Cancellations by reason",
      kind: "bars",
      valueKind: "int",
      series: [{ key: "orders", label: "Orders" }],
      points: [...cancelReasons].map(([reason, entry]) => ({
        label: reason,
        values: [entry.orders],
      })),
    },
    tables: [
      {
        id: "cancel-reasons",
        title: "Cancellations by reason",
        columns: [text("reason", "Reason"), int("orders", "Orders"), money("value", "Order value")],
        rows: [...cancelReasons].map(([reason, entry]) => ({ cells: { reason, ...entry } })),
      },
      {
        id: "fail-reasons",
        title: "Failed deliveries by reason",
        columns: [text("reason", "Reason"), int("orders", "Attempts")],
        rows: [...failReasons]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, orders]) => ({ cells: { reason, orders } })),
      },
      {
        id: "districts",
        title: "By district",
        columns: placeColumns("District"),
        rows: placeRows(districts),
      },
      {
        id: "zones",
        title: "By delivery zone",
        columns: placeColumns("Zone"),
        rows: placeRows(zones),
      },
    ],
    notes: [
      "A failed attempt that is shipped again later is still counted as one failed attempt.",
      "Courier return charges are what was typed on the shipment; until the courier API (Phase 11) they may be missing.",
    ],
  };
}

// ---------------------------------------------------------------------------
// till
// ---------------------------------------------------------------------------

async function posReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const scope = { ...scopeFor(staff, filters), channel: "STORE" as const };
  const [days, payments, byStaff, approvals, names] = await Promise.all([
    repo.tillDaysInRange(scope),
    repo.tillPaymentsByMethod(scope),
    repo.storeSalesByStaff(scope),
    repo.approvedTillDiscounts(scope),
    locationNames(),
  ]);
  const people = await repo.userNames([
    ...byStaff.flatMap((row) => (row.userId === null ? [] : [row.userId])),
    ...approvals.flatMap((row) =>
      [row.soldByUserId, row.discountApprovedByUserId].filter((id): id is string => id !== null),
    ),
  ]);
  const zNet = (z: unknown) =>
    typeof z === "object" && z !== null && "netSalesPoisha" in z
      ? Number((z as { netSalesPoisha: unknown }).netSalesPoisha)
      : null;
  const zBills = (z: unknown) =>
    typeof z === "object" && z !== null && "bills" in z
      ? Number((z as { bills: unknown }).bills)
      : null;
  const differences = days.reduce((sum, day) => sum + (day.differencePoisha ?? 0), 0);
  return {
    definition: reportDefinition("pos"),
    filters,
    kpis: [
      { label: "Till days", value: days.length, kind: "int" },
      {
        label: "Still open",
        value: days.filter((day) => day.status === "OPEN").length,
        kind: "int",
      },
      {
        label: "Cash differences (counted − expected)",
        value: differences,
        kind: "money",
        tone: differences === 0 ? "default" : "warning",
      },
      {
        label: "Takings",
        value: payments.reduce((sum, row) => sum + row.amount, 0),
        kind: "money",
      },
    ],
    chart: {
      title: "Takings by payment method",
      kind: "bars",
      valueKind: "money",
      series: [{ key: "amount", label: "Amount" }],
      points: payments.map((row) => ({ label: humanize(row.method), values: [row.amount] })),
    },
    tables: [
      {
        id: "days",
        title: "Till days (Z-reports)",
        columns: [
          text("reference", "Day"),
          text("location", "Location"),
          text("counter", "Counter"),
          text("opened", "Opened"),
          text("closed", "Closed"),
          int("bills", "Bills"),
          money("net", "Net sales"),
          money("expected", "Expected cash"),
          money("counted", "Counted cash"),
          money("difference", "Difference"),
          text("reason", "Reason"),
        ],
        rows: days.map((day) => ({
          cells: {
            reference: day.reference,
            location: names.get(day.locationId) ?? day.locationId,
            counter: day.counterCode,
            opened: dhakaDateKey(day.openedAt),
            closed: day.closedAt === null ? "Open" : dhakaDateKey(day.closedAt),
            bills: zBills(day.zReport),
            net: zNet(day.zReport),
            expected: day.expectedCashPoisha,
            counted: day.countedCashPoisha,
            difference: day.differencePoisha,
            reason: day.differenceReason ?? "",
          },
          href: `/admin/pos/day/${day.id}`,
        })),
      },
      {
        id: "methods",
        title: "Payments by method",
        columns: [text("method", "Method"), int("count", "Payments"), money("amount", "Amount")],
        rows: payments.map((row) => ({
          cells: { method: humanize(row.method), count: row.count, amount: row.amount },
        })),
      },
      {
        id: "staff",
        title: "Sales by staff",
        columns: [
          text("staff", "Staff"),
          int("bills", "Bills"),
          money("gross", "Gross"),
          money("discount", "Discount"),
          money("manualDiscount", "Of which typed at the till"),
          money("net", "Goods sales"),
        ],
        rows: byStaff
          .map((row) => ({
            cells: {
              staff: row.userId === null ? "—" : (people.get(row.userId) ?? "—"),
              bills: row.bills,
              gross: row.gross,
              discount: row.discount,
              manualDiscount: row.manualDiscount,
              net: row.gross - row.discount,
            },
          }))
          .sort((a, b) => Number(b.cells.net) - Number(a.cells.net)),
      },
      {
        id: "approvals",
        title: "Discounts approved by a manager",
        columns: [
          text("bill", "Bill"),
          text("date", "Date"),
          text("location", "Location"),
          text("seller", "Sold by"),
          text("approver", "Approved by"),
          money("subtotal", "Subtotal"),
          money("discount", "Discount"),
          pct("percent", "Discount %"),
        ],
        rows: approvals.map((row) => ({
          cells: {
            bill: row.orderNumber,
            date: row.soldAt === null ? "" : dhakaDateKey(row.soldAt),
            location: names.get(row.locationId) ?? row.locationId,
            seller: row.soldByUserId === null ? "—" : (people.get(row.soldByUserId) ?? "—"),
            approver:
              row.discountApprovedByUserId === null
                ? "—"
                : (people.get(row.discountApprovedByUserId) ?? "—"),
            subtotal: row.subtotalPoisha,
            discount: row.manualDiscountPoisha,
            percent: percentOf(row.manualDiscountPoisha, row.subtotalPoisha),
          },
          href: `/admin/orders/${row.id}`,
        })),
      },
    ],
    notes: ["Till days are listed by the day they were opened."],
  };
}

// ---------------------------------------------------------------------------
// stock adjustments
// ---------------------------------------------------------------------------

async function movementsReport(staff: StaffContext, filters: ReportFilters): Promise<ReportResult> {
  const showCost = canSeeCost(staff);
  const [rows, names] = await Promise.all([
    repo.lossMovements(
      filters.range.from,
      filters.range.to,
      locationIdsFor(staff, filters.locationId),
      await categoryIdsFor(filters),
    ),
    locationNames(),
  ]);
  const people = await repo.userNames(
    rows.flatMap((row) => (row.userId === null ? [] : [row.userId])),
  );
  const unitsOut = rows.reduce((sum, row) => sum + row.unitsOut, 0);
  const unitsIn = rows.reduce((sum, row) => sum + row.unitsIn, 0);
  const costOut = rows.reduce((sum, row) => sum + row.costOut, 0);
  const byStaff = new Map<string, number>();
  for (const row of rows) {
    const key = row.userId === null ? "System" : (people.get(row.userId) ?? "—");
    byStaff.set(key, (byStaff.get(key) ?? 0) + row.unitsOut);
  }
  return {
    definition: reportDefinition("movements"),
    filters,
    kpis: [
      {
        label: "Units removed",
        value: unitsOut,
        kind: "int",
        tone: unitsOut > 0 ? "negative" : "default",
      },
      { label: "Units added", value: unitsIn, kind: "int" },
      ...(showCost
        ? [
            {
              label: "Removed at current cost",
              value: costOut,
              kind: "money" as const,
              tone: "negative" as const,
            },
          ]
        : []),
    ],
    chart: {
      title: "Units removed by staff",
      kind: "bars",
      valueKind: "int",
      series: [{ key: "units", label: "Units removed" }],
      points: [...byStaff]
        .filter(([, units]) => units > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, units]) => ({ label, values: [units] })),
    },
    tables: [
      {
        id: "movements",
        title: "Adjustments, damage and count corrections",
        columns: [
          text("type", "Type"),
          text("reason", "Reason"),
          text("staff", "Staff"),
          text("location", "Location"),
          int("movements", "Entries"),
          int("unitsIn", "Units added"),
          int("unitsOut", "Units removed"),
          ...(showCost
            ? [
                money("costIn", "Added at cost"),
                money("costOut", "Removed at cost"),
                int("noCost", "Units without cost"),
              ]
            : []),
        ],
        rows: rows.map((row) => ({
          cells: {
            type: humanize(row.type),
            reason: humanize(row.reasonCode),
            staff: row.userId === null ? "System" : (people.get(row.userId) ?? "—"),
            location: names.get(row.locationId) ?? row.locationId,
            movements: row.movements,
            unitsIn: row.unitsIn,
            unitsOut: row.unitsOut,
            ...(showCost
              ? { costIn: row.costIn, costOut: row.costOut, noCost: row.unitsWithoutCost }
              : {}),
          },
        })),
      },
    ],
    notes: [
      ...(showCost ? ["Values use each variant's current weighted average cost."] : []),
      "Repeated removals by the same person or reason are worth a closer look.",
    ],
  };
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

const BUILDERS: Record<
  ReportKey,
  (staff: StaffContext, filters: ReportFilters) => Promise<ReportResult>
> = {
  sales: salesReport,
  products: productsReport,
  profit: profitReport,
  "stock-value": stockValueReport,
  "slow-stock": slowStockReport,
  cod: codReport,
  coupons: couponsReport,
  returns: returnsReport,
  failed: failedReport,
  pos: posReport,
  movements: movementsReport,
};

export async function getReport(
  staff: StaffContext,
  key: ReportKey,
  raw: Record<string, string | string[] | undefined>,
  now = new Date(),
): Promise<ReportResult> {
  assertCanView(staff, key);
  const settings = await getReportSettings();
  return BUILDERS[key](staff, parseReportFilters(raw, settings, now));
}

/** Filter choices for the report header, limited to what the staff member may see. */
export async function getReportFilterOptions(staff: StaffContext) {
  const [locations, categories] = await Promise.all([
    repo.reportLocations(locationScope(staff)),
    repo.reportCategories(),
  ]);
  return { locations, categories };
}

/** One table of a report as CSV rows, audited (report.export). */
export async function exportReportTable(
  staff: StaffContext,
  key: ReportKey,
  raw: Record<string, string | string[] | undefined>,
  tableId: string | null,
  meta: RequestMeta,
) {
  if (!hasPermission(staff, "report.export")) {
    throw new AppError("FORBIDDEN", "Missing permission report.export", {
      messageKey: "errors.forbidden",
    });
  }
  const result = await getReport(staff, key, raw);
  const table = result.tables.find((entry) => entry.id === tableId) ?? result.tables[0];
  if (table === undefined) throw new AppError("NOT_FOUND", "This report has no table.");
  const rows = table.totals === undefined ? table.rows : [...table.rows, { cells: table.totals }];
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.reportExported,
    entityType: "report",
    entityId: `${key}:${table.id}`,
    after: {
      report: key,
      table: table.id,
      rows: rows.length,
      filters: filtersToQuery(result.filters),
    },
    meta,
  });
  return { result, table, rows };
}

/**
 * Every order sold in the period, page by page (keyset on id) — the large
 * export, streamed by the route handler. Online and in store.
 */
export async function* soldOrderPages(
  staff: StaffContext,
  raw: Record<string, string | string[] | undefined>,
  pageSize = 1000,
) {
  assertCanView(staff, "sales");
  const settings = await getReportSettings();
  const filters = parseReportFilters(raw, settings, new Date());
  const scope = scopeFor(staff, filters);
  let after: string | null = null;
  for (;;) {
    const page = await repo.soldOrdersPage(scope, after, pageSize);
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    after = page[page.length - 1]!.id;
  }
}

export async function auditSoldOrdersExport(
  staff: StaffContext,
  raw: Record<string, string | string[] | undefined>,
  meta: RequestMeta,
) {
  if (!hasPermission(staff, "report.export")) {
    throw new AppError("FORBIDDEN", "Missing permission report.export", {
      messageKey: "errors.forbidden",
    });
  }
  assertCanView(staff, "sales");
  const settings = await getReportSettings();
  const filters = parseReportFilters(raw, settings, new Date());
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.reportExported,
    entityType: "report",
    entityId: "sales:orders",
    after: { report: "sales", table: "orders", filters: filtersToQuery(filters) },
    meta,
  });
  return filters;
}
