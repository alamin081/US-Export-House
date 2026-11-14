import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { sanitizeForAudit } from "@/modules/audit/sanitize";
import { movementDeltas, type MovementType } from "./inventory-rules";
import { levelKey, sortedUniqueKeys, type LevelKey } from "./lock-order";

/**
 * Stock writes. Every change to `InventoryLevel` goes through
 * `InventoryUnitOfWork.applyMovements`, which updates the row with a
 * conditional UPDATE and appends the ledger row in the same transaction —
 * there is no other code path that writes stock.
 *
 * Locking (see lock-order.ts): inside one transaction, rows are always locked
 * in this order, each group sorted by id:
 *   1. the document row (transfer or stock count), if any
 *   2. ProductVariant rows, only when the purchase cost changes
 *   3. InventoryLevel rows, by (variantId, locationId)
 */

type Tx = Prisma.TransactionClient;

export interface LevelRow {
  variantId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number | null;
}

export interface MovementInput extends LevelKey {
  type: MovementType;
  /** Signed: positive arrives, negative leaves (RESERVE/RELEASE: reserved). */
  quantity: number;
  reasonCode?: string | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId: string | null;
  unitCostPoisha?: number | null;
}

export interface AppliedMovement extends LevelKey {
  movementId: string;
  type: MovementType;
  quantity: number;
  onHandAfter: number;
  reservedAfter: number;
}

export interface AuditInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  locationId?: string | null;
  before?: unknown;
  after?: unknown;
  ip: string | null;
  userAgent: string | null;
}

/** A conditional UPDATE found less stock than the caller had checked for. */
export class StockChangedError extends Error {
  constructor(readonly key: LevelKey) {
    super("Stock changed while it was locked");
    this.name = "StockChangedError";
  }
}

const SEQUENCES = {
  transfer: Prisma.raw(`'transfer_reference_seq'`),
  count: Prisma.raw(`'stock_count_reference_seq'`),
  receipt: Prisma.raw(`'stock_receipt_reference_seq'`),
} as const;

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeForAudit(value) as Prisma.InputJsonValue;
}

function keyArrays(keys: readonly LevelKey[]) {
  return {
    variantIds: keys.map((key) => key.variantId),
    locationIds: keys.map((key) => key.locationId),
  };
}

export class InventoryUnitOfWork {
  /** Repository-internal; services only call the methods. */
  constructor(readonly tx: Tx) {}

  // -------------------------------------------------------------------------
  // stock rows and the ledger
  // -------------------------------------------------------------------------

  /**
   * Locks the stock rows in global order, creating missing rows (at zero)
   * first, in the same order. `share` takes a FOR SHARE lock and creates
   * nothing: used by stock counts to snapshot without blocking readers.
   */
  async lockLevels(
    keys: readonly LevelKey[],
    mode: "update" | "share" = "update",
  ): Promise<Map<string, LevelRow>> {
    const sorted = sortedUniqueKeys(keys);
    if (sorted.length === 0) return new Map();
    const { variantIds, locationIds } = keyArrays(sorted);

    if (mode === "update") {
      await this.tx.$executeRaw`
        INSERT INTO "InventoryLevel" ("id", "variantId", "locationId", "onHand", "reserved", "createdAt", "updatedAt")
        SELECT 'lvl_' || md5(k.v || '|' || k.l || clock_timestamp()::text || random()::text), k.v, k.l, 0, 0,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM unnest(${variantIds}::text[], ${locationIds}::text[]) WITH ORDINALITY AS k(v, l, n)
        ORDER BY k.n
        ON CONFLICT ("variantId", "locationId") DO NOTHING
      `;
    }
    const lock = mode === "update" ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
    const rows = await this.tx.$queryRaw<LevelRow[]>`
      SELECT il."variantId", il."locationId", il."onHand", il."reserved", il."lowStockThreshold"
      FROM "InventoryLevel" il
      JOIN unnest(${variantIds}::text[], ${locationIds}::text[]) AS k(v, l)
        ON il."variantId" = k.v AND il."locationId" = k.l
      ORDER BY il."variantId", il."locationId"
      ${lock}
    `;
    return new Map(rows.map((row) => [levelKey(row), row]));
  }

  /**
   * Applies movements to rows the caller has already locked and checked. The
   * UPDATE keeps its own guard (never negative, never reserved > onHand) as a
   * second line of defence; the database CHECK constraints are the third.
   */
  async applyMovements(movements: readonly MovementInput[]): Promise<AppliedMovement[]> {
    const rows: Prisma.InventoryMovementCreateManyInput[] = [];
    for (const movement of movements) {
      const deltas = movementDeltas(movement.type, movement.quantity);
      const [after] = await this.tx.$queryRaw<
        Array<{ onHand: number; reserved: number; at: Date }>
      >`
        UPDATE "InventoryLevel"
        SET "onHand" = "onHand" + ${deltas.onHand}::int,
            "reserved" = "reserved" + ${deltas.reserved}::int,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "variantId" = ${movement.variantId} AND "locationId" = ${movement.locationId}
          AND "reserved" + ${deltas.reserved}::int >= 0
          AND ("onHand" + ${deltas.onHand}::int) - ("reserved" + ${deltas.reserved}::int) >= 0
        RETURNING "onHand", "reserved", clock_timestamp() AS at
      `;
      if (after === undefined) throw new StockChangedError(movement);
      rows.push({
        variantId: movement.variantId,
        locationId: movement.locationId,
        type: movement.type,
        quantity: movement.quantity,
        reasonCode: movement.reasonCode ?? null,
        reason: movement.reason ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        userId: movement.userId,
        unitCostPoisha: movement.unitCostPoisha ?? null,
        onHandAfter: after.onHand,
        reservedAfter: after.reserved,
        // The wall clock, not the transaction start: stock counts compare
        // movement times with their snapshot time.
        createdAt: after.at,
      });
    }
    if (rows.length === 0) return [];
    const created = await this.tx.inventoryMovement.createManyAndReturn({
      data: rows,
      select: {
        id: true,
        variantId: true,
        locationId: true,
        type: true,
        quantity: true,
        onHandAfter: true,
        reservedAfter: true,
      },
    });
    return created.map((row) => ({
      movementId: row.id,
      variantId: row.variantId,
      locationId: row.locationId,
      type: row.type as MovementType,
      quantity: row.quantity,
      onHandAfter: row.onHandAfter ?? 0,
      reservedAfter: row.reservedAfter ?? 0,
    }));
  }

  /** Stock rows (from the keys) that already have any ledger history. */
  async keysWithMovements(keys: readonly LevelKey[]): Promise<Set<string>> {
    const sorted = sortedUniqueKeys(keys);
    if (sorted.length === 0) return new Set();
    const { variantIds, locationIds } = keyArrays(sorted);
    const rows = await this.tx.$queryRaw<LevelKey[]>`
      SELECT DISTINCT m."variantId", m."locationId"
      FROM "InventoryMovement" m
      JOIN unnest(${variantIds}::text[], ${locationIds}::text[]) AS k(v, l)
        ON m."variantId" = k.v AND m."locationId" = k.l
    `;
    return new Set(rows.map(levelKey));
  }

  async setLowStockThreshold(key: LevelKey, threshold: number | null) {
    await this.lockLevels([key]);
    await this.tx.inventoryLevel.update({
      where: { variantId_locationId: { variantId: key.variantId, locationId: key.locationId } },
      data: { lowStockThreshold: threshold },
    });
  }

  // -------------------------------------------------------------------------
  // lookups inside the transaction (never through `db`: a transaction holding
  // a pooled connection must not wait for a second one)
  // -------------------------------------------------------------------------

  async variantSkus(ids: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.tx.productVariant.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, sku: true },
    });
    return new Map(rows.map((row) => [row.id, row.sku]));
  }

  async locations(ids: readonly string[]) {
    const rows = await this.tx.location.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true, isActive: true, deletedAt: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  // -------------------------------------------------------------------------
  // purchase cost
  // -------------------------------------------------------------------------

  async lockVariants(ids: readonly string[]) {
    const sorted = [...new Set(ids)].sort();
    if (sorted.length === 0) return new Map<string, { costPoisha: number | null }>();
    const rows = await this.tx.$queryRaw<Array<{ id: string; costPoisha: number | null }>>`
      SELECT "id", "costPoisha" FROM "ProductVariant"
      WHERE "id" = ANY(${sorted}::text[])
      ORDER BY "id"
      FOR UPDATE
    `;
    return new Map(rows.map((row) => [row.id, { costPoisha: row.costPoisha }]));
  }

  /** Units the business owns per variant: every location plus stock in transit. */
  async ownedQuantities(ids: readonly string[]): Promise<Map<string, number>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.tx.$queryRaw<Array<{ variantId: string; quantity: bigint }>>`
      SELECT x."variantId", SUM(x.q)::bigint AS quantity FROM (
        SELECT "variantId", "onHand" AS q FROM "InventoryLevel" WHERE "variantId" = ANY(${unique}::text[])
        UNION ALL
        SELECT ti."variantId", ti."quantitySent" AS q
        FROM "StockTransferItem" ti JOIN "StockTransfer" t ON t."id" = ti."transferId"
        WHERE t."status" = 'DISPATCHED' AND ti."variantId" = ANY(${unique}::text[])
      ) x GROUP BY x."variantId"
    `;
    return new Map(rows.map((row) => [row.variantId, Number(row.quantity)]));
  }

  async setVariantCost(variantId: string, costPoisha: number | null) {
    await this.tx.productVariant.update({ where: { id: variantId }, data: { costPoisha } });
  }

  // -------------------------------------------------------------------------
  // documents
  // -------------------------------------------------------------------------

  async nextSequence(name: keyof typeof SEQUENCES): Promise<number> {
    const [row] = await this.tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval(${SEQUENCES[name]}) AS value
    `;
    return Number(row?.value ?? 0);
  }

  async createReceipt(data: {
    reference: string;
    kind: "OPENING" | "PURCHASE";
    source: "MANUAL" | "CSV";
    locationId: string | null;
    supplierReference: string | null;
    note: string | null;
    fileName: string | null;
    fileHash: string | null;
    rowCount: number;
    totalQuantity: number;
    createdByUserId: string | null;
  }) {
    return this.tx.stockReceipt.create({ data, select: { id: true, reference: true } });
  }

  async audit(entry: AuditInput) {
    const before = toJson(entry.before);
    const after = toJson(entry.after);
    await this.tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        locationId: entry.locationId ?? null,
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
        ip: entry.ip,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// transaction runner
// ---------------------------------------------------------------------------

const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);

/** Deadlock or serialization failure, however the driver adapter wraps it. */
export function isRetryableTransactionError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record.code === "P2034") return true;
    for (const key of ["code", "originalCode", "sqlState"]) {
      const value = record[key];
      if (typeof value === "string" && RETRYABLE_SQLSTATES.has(value)) return true;
    }
    const meta = record.meta as Record<string, unknown> | undefined;
    current = meta?.driverAdapterError ?? record.cause;
  }
  return false;
}

/** A lock could not be taken within `lock_timeout` (55P03). */
export function isLockTimeoutError(error: unknown): boolean {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) ?? "";
  return text.includes("55P03") || text.includes("lock timeout");
}

export async function runInventoryTransaction<T>(
  work: (uow: InventoryUnitOfWork) => Promise<T>,
  options: { timeoutMs?: number; attempts?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
          return work(new InventoryUnitOfWork(tx));
        },
        { timeout: options.timeoutMs ?? 20_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (attempt >= attempts || !isRetryableTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 50));
    }
  }
}
