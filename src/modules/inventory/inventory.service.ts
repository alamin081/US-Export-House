import { createHash } from "node:crypto";

import type { z } from "zod";

import { PAGE_SIZE } from "@/config/constants";
import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  canAccessLocation,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import type { PermissionKey } from "@/modules/access/permissions";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { escapeLike, searchTerms } from "@/modules/catalog/search-text";
import { getInventorySettings } from "@/modules/settings/settings.service";
import {
  findCategoryOptions,
  findCategoryWithDescendants,
  findInTransit,
  findKeysWithMovements,
  findLevels,
  findLevelsFor,
  findLocationAvailable,
  findLocationsByCodes,
  findLowStock,
  findMatrixVariantIds,
  findMovements,
  findOnlineAvailable,
  findProductOnlineAvailability,
  findProductsBestAvailability,
  findReceiptsByFileHash,
  findVariantByCode,
  findVariantsByIds,
  findVariantsBySkus,
  findVariantStockDetail,
  searchVariants,
  type VariantSummaryRow,
} from "./inventory-query.repository";
import {
  runInventoryTransaction,
  StockChangedError,
  type AppliedMovement,
  type InventoryUnitOfWork,
  type MovementInput,
} from "./inventory.repository";
import {
  adjustmentMovement,
  availableOf,
  formatDocumentReference,
  isValidChange,
  lowStockState,
  effectiveThreshold,
  movementDeltas,
  needsLargeAdjustmentConfirmation,
  stockStatus,
  weightedAverageCost,
  ADJUSTMENT_REASON_LABELS,
  type StockStatus,
} from "./inventory-rules";
import {
  adjustSchema,
  commitSaleSchema,
  importModeSchema,
  matrixQuerySchema,
  movementQuerySchema,
  receiveSchema,
  reserveSchema,
  thresholdSchema,
} from "./inventory.schema";
import { findActiveLocations, findLocationById } from "./location.repository";
import { levelKey, type LevelKey } from "./lock-order";
import { parseStockCsv, STOCK_CSV_TEMPLATE } from "./stock-csv";

/**
 * Stock: receiving, CSV import, adjustments, reservations and sales, plus the
 * read models (matrix, history, low stock, availability).
 *
 * Every public function takes the actor and checks permission AND location
 * access itself. Later phases (orders, POS) call reserve / release /
 * commitSale with a system actor or the till user.
 */

export { ADJUSTMENT_REASON_LABELS, STOCK_CSV_TEMPLATE };

/** Work done by the application itself (an order timeout, a webhook). */
export interface SystemActor {
  system: true;
  label: string;
}

export type InventoryActor = StaffContext | SystemActor;

function isSystem(actor: InventoryActor): actor is SystemActor {
  return "system" in actor;
}

function actorUserId(actor: InventoryActor): string | null {
  return isSystem(actor) ? null : actor.userId;
}

function invalid(message: string, details: Record<string, unknown> = {}): AppError {
  return new AppError("VALIDATION_FAILED", message, { details });
}

export function zodMessage(error: {
  issues: ReadonlyArray<{ message: string; path: PropertyKey[] }>;
}) {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join(".") ?? "";
  return invalid(issue?.message ?? "Check the form and try again.", field === "" ? {} : { field });
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw zodMessage(result.error);
  return result.data;
}

/** Locations this staff member may see (active ones), for pickers and filters. */
export async function listStaffLocations(staff: StaffContext) {
  return findActiveLocations(locationScope(staff));
}

async function requireActiveLocation(staff: StaffContext | null, locationId: string) {
  if (staff !== null) assertLocationAccess(staff, locationId);
  const location = await findLocationById(locationId);
  if (location === null) {
    throw new AppError("NOT_FOUND", "Location not found.", { messageKey: "errors.notFound" });
  }
  if (!location.isActive) throw invalid(`${location.code} is inactive.`);
  return location;
}

function variantLabel(variant: VariantSummaryRow): string {
  return variant.labelEn === null
    ? variant.product.nameEn
    : `${variant.product.nameEn} — ${variant.labelEn}`;
}

async function requireLiveVariants(ids: readonly string[]) {
  const variants = await findVariantsByIds(ids);
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const id of ids) {
    const variant = byId.get(id);
    if (variant === undefined) throw invalid("An item in the list no longer exists.");
    if (variant.deletedAt !== null || variant.product.deletedAt !== null) {
      throw invalid(`${variant.sku} has been archived and cannot take stock.`);
    }
  }
  return byId;
}

// ---------------------------------------------------------------------------
// the stock engine (shared with transfers and counts)
// ---------------------------------------------------------------------------

interface Shortfall extends LevelKey {
  requested: number;
  available: number;
  reserved: number;
  releasing: boolean;
}

async function shortfallError(
  uow: InventoryUnitOfWork,
  shortfalls: readonly Shortfall[],
): Promise<AppError> {
  const skus = await uow.variantSkus(shortfalls.map((line) => line.variantId));
  const locations = await uow.locations(shortfalls.map((line) => line.locationId));
  const lines = shortfalls.map((line) => ({
    sku: skus.get(line.variantId) ?? line.variantId,
    location: locations.get(line.locationId)?.code ?? line.locationId,
    requested: line.requested,
    available: line.available,
    short: line.requested - line.available,
  }));
  const message = shortfalls[0]?.releasing
    ? `Cannot release more than is reserved: ${lines
        .map(
          (line) =>
            `${line.sku} at ${line.location} (${line.available} reserved, ${line.requested} asked)`,
        )
        .join("; ")}.`
    : `Not enough stock: ${lines
        .map(
          (line) =>
            `${line.sku} at ${line.location} needs ${line.requested}, ${line.available} available (${line.short} short)`,
        )
        .join("; ")}.`;
  return new AppError("OUT_OF_STOCK", message, { details: { lines } });
}

/**
 * Locks every stock row the movements touch (in global order), checks that
 * every movement keeps its row valid, and only then writes. A shortage on any
 * line rolls back the whole operation with a message naming each SKU.
 */
export async function applyStockMovements(
  uow: InventoryUnitOfWork,
  movements: readonly MovementInput[],
): Promise<AppliedMovement[]> {
  const levels = await uow.lockLevels(movements);
  const state = new Map(
    [...levels.entries()].map(([key, level]) => [
      key,
      { onHand: level.onHand, reserved: level.reserved },
    ]),
  );
  const shortfalls: Shortfall[] = [];
  for (const movement of movements) {
    const key = levelKey(movement);
    const current = state.get(key) ?? { onHand: 0, reserved: 0 };
    const deltas = movementDeltas(movement.type, movement.quantity);
    if (!isValidChange(current, deltas)) {
      const releasing = movement.type === "RELEASE";
      shortfalls.push({
        variantId: movement.variantId,
        locationId: movement.locationId,
        requested: Math.abs(movement.quantity),
        available: releasing ? current.reserved : availableOf(current),
        reserved: current.reserved,
        releasing,
      });
      continue;
    }
    state.set(key, {
      onHand: current.onHand + deltas.onHand,
      reserved: current.reserved + deltas.reserved,
    });
  }
  if (shortfalls.length > 0) throw await shortfallError(uow, shortfalls);
  try {
    return await uow.applyMovements(movements);
  } catch (error) {
    if (error instanceof StockChangedError) {
      throw new AppError("CONFLICT", "Stock changed while saving. Please try again.");
    }
    throw error;
  }
}

async function documentReference(uow: InventoryUnitOfWork, kind: "receipt" | "transfer" | "count") {
  const prefix = { receipt: "RCV", transfer: "TRF", count: "CNT" }[kind];
  return formatDocumentReference(prefix, new Date().getFullYear(), await uow.nextSequence(kind));
}

export { documentReference as nextDocumentReference };

// ---------------------------------------------------------------------------
// receiving (manual and CSV)
// ---------------------------------------------------------------------------

interface ReceiveLine extends LevelKey {
  quantity: number;
  unitCostPoisha: number | null;
}

interface ReceiptHeader {
  kind: "OPENING" | "PURCHASE";
  source: "MANUAL" | "CSV";
  locationId: string | null;
  supplierReference: string | null;
  note: string | null;
  fileName: string | null;
  fileHash: string | null;
  rowCount: number;
}

/**
 * Writes a receipt: the document, one ledger row per line and the weighted
 * average cost. OPENING lines are refused for any stock row that already has
 * history. Runs inside the caller's transaction.
 */
async function writeReceipt(
  uow: InventoryUnitOfWork,
  actor: StaffContext,
  header: ReceiptHeader,
  lines: readonly ReceiveLine[],
) {
  const variantIds = lines.map((line) => line.variantId);
  const costed = lines.some((line) => line.unitCostPoisha !== null);
  // Lock order: variants (cost) before stock rows.
  const variants = costed ? await uow.lockVariants(variantIds) : new Map();
  const owned = costed ? await uow.ownedQuantities(variantIds) : new Map<string, number>();
  await uow.lockLevels(lines);

  if (header.kind === "OPENING") {
    const withHistory = await uow.keysWithMovements(lines);
    const blocked = lines.filter((line) => withHistory.has(levelKey(line)));
    if (blocked.length > 0) {
      const skus = await uow.variantSkus(blocked.map((line) => line.variantId));
      throw invalid(
        `Opening stock is only for items with no stock history at that location. Already has history: ${blocked
          .map((line) => skus.get(line.variantId) ?? line.variantId)
          .join(", ")}. Use Stock receive instead.`,
      );
    }
  }

  const reference = await documentReference(uow, "receipt");
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  const receipt = await uow.createReceipt({
    reference,
    ...header,
    totalQuantity,
    createdByUserId: actor.userId,
  });

  await applyStockMovements(
    uow,
    lines.map((line) => ({
      variantId: line.variantId,
      locationId: line.locationId,
      type: header.kind === "OPENING" ? "OPENING" : "PURCHASE_RECEIVE",
      quantity: line.quantity,
      reasonCode: header.kind,
      reason: header.supplierReference ?? header.note,
      referenceType: "RECEIPT",
      referenceId: receipt.id,
      userId: actor.userId,
      unitCostPoisha: line.unitCostPoisha,
    })),
  );

  // Weighted average cost, line by line, from what was owned before.
  if (costed) {
    const costs = new Map<string, number | null>();
    const quantities = new Map<string, number>();
    for (const line of lines) {
      const current = costs.has(line.variantId)
        ? (costs.get(line.variantId) ?? null)
        : ((variants.get(line.variantId) as { costPoisha: number | null } | undefined)
            ?.costPoisha ?? null);
      const currentQty = quantities.get(line.variantId) ?? owned.get(line.variantId) ?? 0;
      costs.set(
        line.variantId,
        weightedAverageCost({
          currentQty,
          currentCostPoisha: current,
          receivedQty: line.quantity,
          unitCostPoisha: line.unitCostPoisha,
        }),
      );
      quantities.set(line.variantId, currentQty + line.quantity);
    }
    for (const [variantId, cost] of costs) {
      const before =
        (variants.get(variantId) as { costPoisha: number | null } | undefined)?.costPoisha ?? null;
      if (cost !== before) await uow.setVariantCost(variantId, cost);
    }
  }
  return { id: receipt.id, reference, totalQuantity };
}

/** Stock from a supplier (or opening stock) entered on the receive screen. */
export async function receive(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "inventory.receive");
  const data = parse(receiveSchema, input);
  const location = await requireActiveLocation(actor, data.locationId);
  await requireLiveVariants(data.lines.map((line) => line.variantId));

  const lines: ReceiveLine[] = mergeReceiveLines(
    data.lines.map((line) => ({
      variantId: line.variantId,
      locationId: location.id,
      quantity: line.quantity,
      unitCostPoisha: line.unitCostPoisha ?? null,
    })),
  );

  return runInventoryTransaction(
    async (uow) => {
      const receipt = await writeReceipt(
        uow,
        actor,
        {
          kind: data.kind,
          source: "MANUAL",
          locationId: location.id,
          supplierReference: data.supplierReference,
          note: data.note,
          fileName: null,
          fileHash: null,
          rowCount: data.lines.length,
        },
        lines,
      );
      await uow.audit({
        userId: actor.userId,
        action: AUDIT_ACTIONS.stockReceived,
        entityType: "stock_receipt",
        entityId: receipt.id,
        locationId: location.id,
        after: {
          reference: receipt.reference,
          kind: data.kind,
          supplierReference: data.supplierReference,
          lines: lines.length,
          totalQuantity: receipt.totalQuantity,
        },
        ...meta,
      });
      return receipt;
    },
    { timeoutMs: 60_000 },
  );
}

/** Same variant twice on one receipt: add the quantities, average the cost. */
function mergeReceiveLines(lines: readonly ReceiveLine[]): ReceiveLine[] {
  const merged = new Map<string, ReceiveLine & { costed: number; costSum: number }>();
  for (const line of lines) {
    const key = levelKey(line);
    const existing = merged.get(key);
    const costed = line.unitCostPoisha === null ? 0 : line.quantity;
    const costSum = (line.unitCostPoisha ?? 0) * line.quantity;
    if (existing === undefined) {
      merged.set(key, { ...line, costed, costSum });
    } else {
      existing.quantity += line.quantity;
      existing.costed += costed;
      existing.costSum += costSum;
    }
  }
  return [...merged.values()].map(({ costed, costSum, ...line }) => ({
    ...line,
    unitCostPoisha: costed === 0 ? null : Math.round(costSum / costed),
  }));
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export type ImportMode = "OPENING" | "PURCHASE";

export interface ImportPreviewLine {
  rows: number[];
  locationCode: string;
  sku: string;
  productName: string | null;
  quantity: number;
  unitCostPoisha: number | null;
  currentOnHand: number | null;
  newOnHand: number | null;
  status: "new" | "change" | "error";
  message: string | null;
}

export interface ImportPreview {
  fileName: string;
  sha256: string;
  mode: ImportMode;
  delimiter: string;
  dataRows: number;
  lines: ImportPreviewLine[];
  errors: Array<{ row: number | null; message: string }>;
  warnings: Array<{ row: number | null; message: string }>;
  totalQuantity: number;
  previousImports: Array<{ reference: string; createdAt: string; by: string | null }>;
  canApply: boolean;
}

interface ResolvedImport {
  preview: ImportPreview;
  lines: ReceiveLine[];
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function resolveImport(
  actor: StaffContext,
  input: { fileName: string; bytes: Uint8Array; mode: unknown },
): Promise<ResolvedImport> {
  assertPermission(actor, "inventory.receive");
  const mode = parse(importModeSchema, input.mode);
  const settings = await getInventorySettings();
  const fileName = input.fileName.slice(0, 120) || "stock.csv";
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const preview: ImportPreview = {
    fileName,
    sha256,
    mode,
    delimiter: ",",
    dataRows: 0,
    lines: [],
    errors: [],
    warnings: [],
    totalQuantity: 0,
    previousImports: [],
    canApply: false,
  };

  if (input.bytes.byteLength === 0) {
    preview.errors.push({ row: null, message: "The file is empty." });
    return { preview, lines: [] };
  }
  if (input.bytes.byteLength > settings.importMaxBytes) {
    preview.errors.push({
      row: null,
      message: `The file is larger than ${Math.round(settings.importMaxBytes / 1024)} KB. Split it into smaller files.`,
    });
    return { preview, lines: [] };
  }
  const text = decodeUtf8(input.bytes);
  if (text === null) {
    preview.errors.push({
      row: null,
      message:
        'The file is not UTF-8 text. In Excel use "Save As" → "CSV UTF-8 (Comma delimited)".',
    });
    return { preview, lines: [] };
  }

  const parsed = parseStockCsv(text, { maxRows: settings.importMaxRows });
  preview.delimiter = parsed.delimiter;
  preview.dataRows = parsed.dataRows;
  preview.errors.push(...parsed.errors);
  preview.warnings.push(...parsed.warnings);

  const [locations, variants] = await Promise.all([
    findLocationsByCodes(parsed.lines.map((line) => line.locationCode)),
    findVariantsBySkus(parsed.lines.map((line) => line.sku)),
  ]);
  const locationByCode = new Map(locations.map((location) => [location.code, location]));

  const resolved: Array<{
    line: (typeof parsed.lines)[number];
    key: LevelKey | null;
    variant: VariantSummaryRow | null;
    error: string | null;
  }> = [];
  for (const line of parsed.lines) {
    const location = locationByCode.get(line.locationCode);
    const variant = variants.get(line.sku.toLowerCase()) ?? null;
    let error: string | null = null;
    if (location === undefined || location.deletedAt !== null) {
      error = `Unknown location code ${line.locationCode}.`;
    } else if (!location.isActive) {
      error = `Location ${line.locationCode} is inactive.`;
    } else if (!canAccessLocation(actor, location.id)) {
      error = `You do not have access to ${line.locationCode}.`;
    } else if (variant === null) {
      error = `Unknown SKU ${line.sku}.`;
    } else if (variant.deletedAt !== null || variant.product.deletedAt !== null) {
      error = `${variant.sku} is archived.`;
    }
    resolved.push({
      line,
      key:
        location !== undefined && variant !== null
          ? { variantId: variant.id, locationId: location.id }
          : null,
      variant,
      error,
    });
  }

  const keys = resolved.flatMap((entry) =>
    entry.key === null || entry.error !== null ? [] : [entry.key],
  );
  const [levels, withHistory] = await Promise.all([
    findLevels(keys),
    mode === "OPENING" ? findKeysWithMovements(keys) : Promise.resolve(new Set<string>()),
  ]);

  const lines: ReceiveLine[] = [];
  for (const entry of resolved) {
    let { error } = entry;
    if (
      error === null &&
      entry.key !== null &&
      mode === "OPENING" &&
      withHistory.has(levelKey(entry.key))
    ) {
      error = `${entry.variant?.sku ?? entry.line.sku} already has stock history at ${entry.line.locationCode}; import it as Stock receive.`;
    }
    const current = entry.key === null ? undefined : levels.get(levelKey(entry.key));
    const currentOnHand = error === null ? (current?.onHand ?? 0) : null;
    preview.lines.push({
      rows: entry.line.rows,
      locationCode: entry.line.locationCode,
      sku: entry.variant?.sku ?? entry.line.sku,
      productName: entry.variant === null ? null : variantLabel(entry.variant),
      quantity: entry.line.quantity,
      unitCostPoisha: entry.line.unitCostPoisha,
      currentOnHand,
      newOnHand: currentOnHand === null ? null : currentOnHand + entry.line.quantity,
      status: error !== null ? "error" : (current?.onHand ?? 0) > 0 ? "change" : "new",
      message: error,
    });
    if (error !== null) {
      preview.errors.push({ row: entry.line.rows[0] ?? null, message: error });
    } else if (entry.key !== null) {
      lines.push({
        ...entry.key,
        quantity: entry.line.quantity,
        unitCostPoisha: entry.line.unitCostPoisha,
      });
      preview.totalQuantity += entry.line.quantity;
    }
  }
  preview.errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

  preview.previousImports = (await findReceiptsByFileHash(sha256)).map((receipt) => ({
    reference: receipt.reference,
    createdAt: receipt.createdAt.toISOString(),
    by: receipt.createdBy?.name ?? receipt.createdBy?.email ?? null,
  }));
  if (preview.previousImports.length > 0) {
    preview.warnings.unshift({
      row: null,
      message: `This exact file was already imported (${preview.previousImports
        .map((receipt) => receipt.reference)
        .join(", ")}). Importing it again adds the stock a second time.`,
    });
  }
  preview.canApply = preview.errors.length === 0 && lines.length > 0;
  return { preview, lines };
}

/** Dry run: what the file would do, row by row. Nothing is saved. */
export async function previewImport(
  actor: StaffContext,
  input: { fileName: string; bytes: Uint8Array; mode: unknown },
): Promise<ImportPreview> {
  return (await resolveImport(actor, input)).preview;
}

/**
 * Applies a previewed file in ONE transaction: any bad row means nothing is
 * saved. The same file twice needs `confirmDuplicate`.
 */
export async function applyImport(
  actor: StaffContext,
  input: {
    fileName: string;
    bytes: Uint8Array;
    mode: unknown;
    expectedSha256: string;
    confirmDuplicate: boolean;
  },
  meta: RequestMeta,
) {
  const { preview, lines } = await resolveImport(actor, input);
  if (preview.sha256 !== input.expectedSha256) {
    throw invalid("The file is not the one that was previewed. Preview it again.");
  }
  if (!preview.canApply) {
    throw invalid(`The file has ${preview.errors.length} error(s); nothing was saved.`, {
      errors: preview.errors.slice(0, 50),
    });
  }
  if (preview.previousImports.length > 0 && !input.confirmDuplicate) {
    throw new AppError("CONFLICT", "This file was already imported. Confirm to import it again.", {
      details: { reason: "duplicate_file", previous: preview.previousImports },
    });
  }

  const locationIds = [...new Set(lines.map((line) => line.locationId))];
  return runInventoryTransaction(
    async (uow) => {
      const receipt = await writeReceipt(
        uow,
        actor,
        {
          kind: preview.mode,
          source: "CSV",
          locationId: locationIds.length === 1 ? (locationIds[0] ?? null) : null,
          supplierReference: null,
          note: null,
          fileName: preview.fileName,
          fileHash: preview.sha256,
          rowCount: preview.dataRows,
        },
        lines,
      );
      await uow.audit({
        userId: actor.userId,
        action: AUDIT_ACTIONS.stockImported,
        entityType: "stock_receipt",
        entityId: receipt.id,
        locationId: locationIds.length === 1 ? (locationIds[0] ?? null) : null,
        after: {
          reference: receipt.reference,
          mode: preview.mode,
          fileName: preview.fileName,
          sha256: preview.sha256,
          rows: preview.dataRows,
          lines: lines.length,
          totalQuantity: receipt.totalQuantity,
          locations: locationIds.length,
          reimport: preview.previousImports.length > 0,
        },
        ...meta,
      });
      return { ...receipt, lines: lines.length };
    },
    { timeoutMs: 180_000 },
  );
}

// ---------------------------------------------------------------------------
// adjustments and thresholds
// ---------------------------------------------------------------------------

export async function adjust(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "inventory.adjust");
  const data = parse(adjustSchema, input);
  const location = await requireActiveLocation(actor, data.locationId);
  const variants = await requireLiveVariants([data.variantId]);
  const movement = adjustmentMovement(data.reason, data.delta);
  if ("error" in movement) throw invalid(movement.error, { field: "delta" });

  const settings = await getInventorySettings();
  if (
    needsLargeAdjustmentConfirmation(data.delta, settings.adjustConfirmAbove) &&
    !data.confirmed
  ) {
    throw invalid(
      `This changes stock by ${Math.abs(data.delta)} units (more than ${settings.adjustConfirmAbove}). Tick the confirmation box to continue.`,
      { field: "confirmed", needsConfirmation: true },
    );
  }

  return runInventoryTransaction(async (uow) => {
    const [applied] = await applyStockMovements(uow, [
      {
        variantId: data.variantId,
        locationId: location.id,
        type: movement.type,
        quantity: data.delta,
        reasonCode: data.reason,
        reason: data.note,
        referenceType: "ADJUSTMENT",
        referenceId: null,
        userId: actor.userId,
      },
    ]);
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.stockAdjusted,
      entityType: "inventory_level",
      entityId: `${data.variantId}:${location.id}`,
      locationId: location.id,
      before: { onHand: (applied?.onHandAfter ?? 0) - data.delta },
      after: {
        sku: variants.get(data.variantId)?.sku,
        location: location.code,
        delta: data.delta,
        reason: data.reason,
        note: data.note,
        onHand: applied?.onHandAfter,
      },
      ...meta,
    });
    return { onHand: applied?.onHandAfter ?? 0, reserved: applied?.reservedAfter ?? 0 };
  });
}

export async function setLowStockThreshold(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "inventory.adjust");
  const data = parse(thresholdSchema, input);
  const location = await requireActiveLocation(actor, data.locationId);
  await requireLiveVariants([data.variantId]);
  const [before] = await findLevelsFor([data.variantId], [location.id]);
  await runInventoryTransaction(async (uow) => {
    await uow.setLowStockThreshold(
      { variantId: data.variantId, locationId: location.id },
      data.threshold,
    );
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.lowStockThresholdChanged,
      entityType: "inventory_level",
      entityId: `${data.variantId}:${location.id}`,
      locationId: location.id,
      before: { lowStockThreshold: before?.lowStockThreshold ?? null },
      after: { lowStockThreshold: data.threshold },
      ...meta,
    });
  });
}

// ---------------------------------------------------------------------------
// reservations and sales (used by Phase 8 orders and the Phase 9 till)
// ---------------------------------------------------------------------------

function assertSalesActor(
  actor: InventoryActor,
  locationId: string,
  permissions: readonly PermissionKey[],
) {
  if (isSystem(actor)) return;
  if (!permissions.some((permission) => hasPermission(actor, permission))) {
    assertPermission(actor, permissions[0] ?? "order.edit");
  }
  assertLocationAccess(actor, locationId);
}

/** Holds stock for an order: `reserved` goes up, `available` down. */
export async function reserve(actor: InventoryActor, input: unknown) {
  const data = parse(reserveSchema, input);
  assertSalesActor(actor, data.locationId, ["order.edit", "pos.sell"]);
  return runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      data.lines.map((line) => ({
        variantId: line.variantId,
        locationId: data.locationId,
        type: "RESERVE" as const,
        quantity: line.quantity,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        userId: actorUserId(actor),
        reason: isSystem(actor) ? actor.label : null,
      })),
    ),
  );
}

/** Gives a reservation back (cancelled or expired order). */
export async function release(actor: InventoryActor, input: unknown) {
  const data = parse(reserveSchema, input);
  assertSalesActor(actor, data.locationId, ["order.edit", "order.cancel", "pos.sell"]);
  return runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      data.lines.map((line) => ({
        variantId: line.variantId,
        locationId: data.locationId,
        type: "RELEASE" as const,
        quantity: -line.quantity,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        userId: actorUserId(actor),
        reason: isSystem(actor) ? actor.label : null,
      })),
    ),
  );
}

/**
 * The goods leave: onHand goes down, and (for a reserved order) reserved too.
 * Written as RELEASE + SALE rows so the ledger explains both numbers.
 */
export async function commitSale(actor: InventoryActor, input: unknown) {
  const data = parse(commitSaleSchema, input);
  assertSalesActor(
    actor,
    data.locationId,
    data.channel === "STORE" ? ["pos.sell"] : ["order.fulfil"],
  );
  const saleType = data.channel === "STORE" ? ("SALE_STORE" as const) : ("SALE_ONLINE" as const);
  const base = {
    locationId: data.locationId,
    referenceType: data.referenceType,
    referenceId: data.referenceId,
    userId: actorUserId(actor),
    reason: isSystem(actor) ? actor.label : null,
  };
  return runInventoryTransaction((uow) =>
    applyStockMovements(
      uow,
      data.lines.flatMap((line) => [
        ...(data.fromReservation
          ? [
              {
                ...base,
                variantId: line.variantId,
                type: "RELEASE" as const,
                quantity: -line.quantity,
              },
            ]
          : []),
        { ...base, variantId: line.variantId, type: saleType, quantity: -line.quantity },
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// availability (server-side callers: storefront, cart, orders)
// ---------------------------------------------------------------------------

/**
 * Available units per variant, either at one location or online (the
 * default online-fulfilment location). Not permission-checked: it returns no cost and
 * is only called from server code.
 */
export async function getAvailability(
  scope: { online: true } | { locationId: string },
  variantIds: readonly string[],
): Promise<Map<string, number>> {
  const result =
    "online" in scope
      ? await findOnlineAvailable(variantIds)
      : await findLocationAvailable(scope.locationId, variantIds);
  return new Map(variantIds.map((id) => [id, result.get(id) ?? 0]));
}

/** Storefront: per live variant of a published product, in / few / out. */
export async function getProductStockStatus(slug: string): Promise<Record<string, StockStatus>> {
  const [rows, settings] = await Promise.all([
    findProductOnlineAvailability(slug),
    getInventorySettings(),
  ]);
  return Object.fromEntries(
    rows.map((row) => [
      row.variantId,
      stockStatus(Number(row.available), settings.fewLeftThreshold),
    ]),
  );
}

/** Storefront cards: ids of published products whose every variant is out of stock. */
export async function getOutOfStockProductIds(): Promise<string[]> {
  const best = await findProductsBestAvailability();
  return [...best.entries()].filter(([, available]) => available <= 0).map(([id]) => id);
}

// ---------------------------------------------------------------------------
// admin read models
// ---------------------------------------------------------------------------

function cellOf(
  level: { onHand: number; reserved: number; lowStockThreshold: number | null } | undefined,
  lowStockDefault: number,
) {
  const onHand = level?.onHand ?? 0;
  const reserved = level?.reserved ?? 0;
  const available = availableOf({ onHand, reserved });
  const threshold = effectiveThreshold(level?.lowStockThreshold ?? null, lowStockDefault);
  return {
    onHand,
    reserved,
    available,
    threshold,
    hasRow: level !== undefined,
    state: level === undefined ? ("none" as const) : lowStockState(available, threshold),
  };
}

/** Narrows the matrix to one location, or every location the caller may see. */
async function matrixLocations(actor: StaffContext, locationId: string | undefined) {
  const all = await listStaffLocations(actor);
  if (locationId === undefined) return { all, shown: all };
  assertLocationAccess(actor, locationId);
  const one = all.filter((location) => location.id === locationId);
  if (one.length === 0) throw new AppError("NOT_FOUND", "Location not found.");
  return { all, shown: one };
}

export async function getMatrix(
  actor: StaffContext,
  rawQuery: Record<string, unknown>,
  options: { take?: number } = {},
) {
  assertPermission(actor, "inventory.read");
  const query = matrixQuerySchema.parse(rawQuery);
  const [scope, settings] = await Promise.all([
    matrixLocations(actor, query.locationId),
    getInventorySettings(),
  ]);
  const locations = scope.shown;
  const categoryIds =
    query.categoryId === undefined
      ? undefined
      : await findCategoryWithDescendants(query.categoryId);
  const take = options.take ?? PAGE_SIZE.admin;
  const locationIds = locations.map((location) => location.id);
  const { ids, total } = await findMatrixVariantIds({
    terms: searchTerms(query.q ?? "").map(escapeLike),
    ...(categoryIds === undefined ? {} : { categoryIds }),
    locationIds,
    ...(query.stock === undefined ? {} : { stock: query.stock }),
    lowStockDefault: settings.lowStockDefaultThreshold,
    skip: (query.page - 1) * take,
    take,
  });
  const [variants, levels, inTransit] = await Promise.all([
    findVariantsByIds(ids),
    findLevelsFor(ids, locationIds),
    findInTransit(ids, locationIds),
  ]);
  const showCost = hasPermission(actor, "inventory.cost.read");
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const levelByKey = new Map(levels.map((level) => [levelKey(level), level]));

  const rows = ids.flatMap((variantId) => {
    const variant = variantById.get(variantId);
    if (variant === undefined) return [];
    const cells = Object.fromEntries(
      locationIds.map((locationId) => [
        locationId,
        cellOf(
          levelByKey.get(levelKey({ variantId, locationId })),
          settings.lowStockDefaultThreshold,
        ),
      ]),
    );
    const totals = Object.values(cells).reduce(
      (sum, cell) => ({
        onHand: sum.onHand + cell.onHand,
        reserved: sum.reserved + cell.reserved,
        available: sum.available + cell.available,
      }),
      { onHand: 0, reserved: 0, available: 0 },
    );
    return [
      {
        variantId,
        productId: variant.product.id,
        sku: variant.sku,
        barcode: variant.barcode,
        name: variant.product.nameEn,
        label: variant.labelEn,
        isActive: variant.isActive && variant.product.status !== "ARCHIVED",
        cells,
        totals,
        inTransit: inTransit.get(variantId) ?? 0,
        ...(showCost ? { costPoisha: variant.costPoisha } : {}),
      },
    ];
  });

  return {
    query,
    locations: locations.map((location) => ({
      id: location.id,
      code: location.code,
      nameEn: location.nameEn,
      type: location.type,
      isSample: location.isSample,
      isOnlineFulfillment: location.isOnlineFulfillment,
    })),
    /** Every location the caller may pick in the filter. */
    locationOptions: scope.all.map((location) => ({
      id: location.id,
      code: location.code,
      nameEn: location.nameEn,
    })),
    rows,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / take)),
    showCost,
    categories: await findCategoryOptions(),
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Neutralise spreadsheet formulas, then quote when needed.
  const safe = /^[=+\-@]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The matrix (with the same filters) as CSV for Excel. Cost only with inventory.cost.read. */
export async function exportMatrixCsv(actor: StaffContext, rawQuery: Record<string, unknown>) {
  const matrix = await getMatrix(actor, { ...rawQuery, page: 1 }, { take: 20_000 });
  const header = [
    "sku",
    "barcode",
    "product",
    "variant",
    ...matrix.locations.flatMap((location) => [
      `${location.code} on_hand`,
      `${location.code} reserved`,
      `${location.code} available`,
    ]),
    "in_transit",
    "total_on_hand",
    ...(matrix.showCost ? ["unit_cost_tk", "stock_value_tk"] : []),
  ];
  const lines = matrix.rows.map((row) =>
    [
      row.sku,
      row.barcode,
      row.name,
      row.label,
      ...matrix.locations.flatMap((location) => {
        const cell = row.cells[location.id];
        return [cell?.onHand ?? 0, cell?.reserved ?? 0, cell?.available ?? 0];
      }),
      row.inTransit,
      row.totals.onHand,
      ...(matrix.showCost
        ? [
            row.costPoisha === null || row.costPoisha === undefined
              ? ""
              : (row.costPoisha / 100).toFixed(2),
            row.costPoisha === null || row.costPoisha === undefined
              ? ""
              : ((row.costPoisha * (row.totals.onHand + row.inTransit)) / 100).toFixed(2),
          ]
        : []),
    ]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

export async function getVariantStock(
  actor: StaffContext,
  variantId: string,
  rawQuery: Record<string, unknown>,
) {
  assertPermission(actor, "inventory.read");
  const query = movementQuerySchema.parse(rawQuery);
  const variant = await findVariantStockDetail(variantId);
  if (variant === null) throw new AppError("NOT_FOUND", "Item not found.");
  const [locations, settings] = await Promise.all([
    listStaffLocations(actor),
    getInventorySettings(),
  ]);
  if (query.locationId !== undefined) assertLocationAccess(actor, query.locationId);
  const locationIds = locations.map((location) => location.id);
  const take = 50;
  const [levels, inTransit, movements] = await Promise.all([
    findLevelsFor([variantId], locationIds),
    findInTransit([variantId], locationIds),
    findMovements({
      variantId,
      locationIds: query.locationId === undefined ? locationIds : [query.locationId],
      ...(query.type === undefined ? {} : { types: [query.type] }),
      ...(query.from === undefined ? {} : { from: new Date(`${query.from}T00:00:00`) }),
      ...(query.to === undefined
        ? {}
        : { to: new Date(new Date(`${query.to}T00:00:00`).getTime() + 86_400_000) }),
      skip: (query.page - 1) * take,
      take,
    }),
  ]);
  const showCost = hasPermission(actor, "inventory.cost.read");
  const levelByLocation = new Map(levels.map((level) => [level.locationId, level]));
  return {
    query,
    variant: {
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      name: variant.product.nameEn,
      label: variant.labelEn,
      productId: variant.product.id,
      ...(showCost ? { costPoisha: variant.costPoisha } : {}),
    },
    showCost,
    locations: locations.map((location) => ({
      id: location.id,
      code: location.code,
      nameEn: location.nameEn,
      isSample: location.isSample,
      ...cellOf(levelByLocation.get(location.id), settings.lowStockDefaultThreshold),
      lowStockThreshold: levelByLocation.get(location.id)?.lowStockThreshold ?? null,
    })),
    inTransit: inTransit.get(variantId) ?? 0,
    lowStockDefault: settings.lowStockDefaultThreshold,
    adjustConfirmAbove: settings.adjustConfirmAbove,
    movements: movements.rows.map((movement) => ({
      ...movement,
      createdAt: movement.createdAt.toISOString(),
      unitCostPoisha: showCost ? movement.unitCostPoisha : null,
    })),
    movementTotal: movements.total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(movements.total / take)),
  };
}

/** Dashboard widget: the lowest stock rows at the caller's locations. */
export async function getLowStock(actor: StaffContext, limit = 8) {
  assertPermission(actor, "inventory.read");
  const settings = await getInventorySettings();
  const { rows, total } = await findLowStock({
    locationIds: locationScope(actor),
    lowStockDefault: settings.lowStockDefaultThreshold,
    limit: Math.min(Math.max(limit, 1), 100),
  });
  return {
    total,
    rows: rows.map((row) => ({
      variantId: row.variantId,
      locationCode: row.locationCode,
      sku: row.sku,
      name: row.labelEn === null ? row.productName : `${row.productName} — ${row.labelEn}`,
      available: Math.max(0, Number(row.available)),
      threshold: Number(row.threshold),
    })),
  };
}

// ---------------------------------------------------------------------------
// scanning and item pickers
// ---------------------------------------------------------------------------

export interface PickedVariant {
  variantId: string;
  sku: string;
  barcode: string | null;
  name: string;
  isActive: boolean;
}

function toPicked(variant: VariantSummaryRow): PickedVariant {
  return {
    variantId: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    name: variantLabel(variant),
    isActive: variant.isActive,
  };
}

/** A scanned barcode or typed SKU. Unknown codes are a 404, never a guess. */
export async function lookupVariant(actor: StaffContext, code: string): Promise<PickedVariant> {
  assertPermission(actor, "inventory.read");
  const variant = await findVariantByCode(code.slice(0, 64));
  if (variant === null || variant.product.deletedAt !== null) {
    throw new AppError(
      "NOT_FOUND",
      `No item has the barcode or SKU "${code.trim().slice(0, 64)}".`,
    );
  }
  return toPicked(variant);
}

export async function searchVariantsForPicker(
  actor: StaffContext,
  q: string,
): Promise<PickedVariant[]> {
  assertPermission(actor, "inventory.read");
  const terms = searchTerms(q.slice(0, 80)).map(escapeLike);
  return (await searchVariants(terms, 15)).map(toPicked);
}

/** Category choices for inventory filters and count scopes. */
export async function listCategoryOptions(actor: StaffContext) {
  assertPermission(actor, "inventory.read");
  return findCategoryOptions();
}
