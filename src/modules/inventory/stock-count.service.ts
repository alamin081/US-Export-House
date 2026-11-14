import { AppError } from "@/lib/errors";
import {
  assertLocationAccess,
  assertPermission,
  hasPermission,
  locationScope,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import {
  findCategoryWithDescendants,
  findLevels,
  findVariantByCode,
} from "./inventory-query.repository";
import { runInventoryTransaction, type InventoryUnitOfWork } from "./inventory.repository";
import { reconcileCountLine } from "./inventory-rules";
import { countApplySchema, countRecordSchema, countStartSchema } from "./inventory.schema";
import { applyStockMovements, nextDocumentReference, parse } from "./inventory.service";
import { findLocationById } from "./location.repository";
import { levelKey } from "./lock-order";
import {
  addCountItem,
  clock,
  createStockCount,
  findOpenCountAt,
  findStockCount,
  isOpenCountConflict,
  isVariantInCategories,
  listStockCounts,
  lockStockCount,
  recordCountedQty,
  saveCountLineResults,
  snapshotLevels,
  startCountedQty,
  sumMovementsSinceSnapshot,
  updateStockCount,
} from "./stock-count.repository";

/**
 * Physical stock counts: IN_PROGRESS -> SUBMITTED -> APPLIED (or CANCELLED).
 *
 * Starting a count snapshots what the system expects. Selling or transferring
 * at the location carries on during the count; each line's correction is
 *   counted - (snapshot + movements between the snapshot and the moment the
 *              line was last counted)
 * so a sale during the count is never mistaken for missing stock. Lines that
 * were never counted stay unchanged (with a warning) unless a Store Manager
 * explicitly sets them to 0.
 */

type CountStatus = "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "APPLIED" | "CANCELLED";

function conflict(message: string): AppError {
  return new AppError("CONFLICT", message);
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", "Stock count not found.", { messageKey: "errors.notFound" });
}

async function lockedCount(uow: InventoryUnitOfWork, actor: StaffContext, id: string) {
  const count = await lockStockCount(uow, id);
  if (count === null) throw notFound();
  assertLocationAccess(actor, count.locationId);
  return count;
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function listCounts(actor: StaffContext, rawQuery: Record<string, unknown>) {
  assertPermission(actor, "inventory.read");
  const page = Math.max(1, Number(rawQuery.page ?? 1) || 1);
  const statusRaw = typeof rawQuery.status === "string" ? rawQuery.status : "";
  const status = (["IN_PROGRESS", "SUBMITTED", "APPLIED", "CANCELLED"] as const).find(
    (value) => value === statusRaw,
  );
  const take = 25;
  const { rows, total } = await listStockCounts({
    scope: locationScope(actor),
    ...(status === undefined ? {} : { status }),
    skip: (page - 1) * take,
    take,
  });
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / take)), status };
}

export async function getCount(actor: StaffContext, id: string) {
  assertPermission(actor, "inventory.read");
  const count = await findStockCount(id);
  if (count === null) throw notFound();
  assertLocationAccess(actor, count.locationId);

  // Live figures while counting; the stored ones once submitted.
  const live = count.status === "IN_PROGRESS" || count.status === "SUBMITTED";
  const movements = live
    ? await sumMovementsSinceSnapshot(
        null,
        count.locationId,
        count.items.map((item) => ({
          variantId: item.variantId,
          snapshotAt: item.snapshotAt,
          cutoff: item.countedAt ?? new Date(),
        })),
      )
    : new Map<string, number>();
  const current = live
    ? await findLevels(
        count.items.map((item) => ({ variantId: item.variantId, locationId: count.locationId })),
      )
    : new Map();

  const lines = count.items.map((item) => {
    const since = live ? (movements.get(item.variantId) ?? 0) : (item.movementsSinceSnapshot ?? 0);
    const result =
      item.countedQty === null
        ? null
        : reconcileCountLine({
            systemQty: item.systemQty,
            movementsSinceSnapshot: since,
            countedQty: item.countedQty,
          });
    return {
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      barcode: item.variant.barcode,
      name:
        item.variant.labelEn === null
          ? item.variant.product.nameEn
          : `${item.variant.product.nameEn} — ${item.variant.labelEn}`,
      systemQty: item.systemQty,
      movementsSinceSnapshot: since,
      expectedQty: item.systemQty + since,
      countedQty: item.countedQty,
      countedAt: item.countedAt?.toISOString() ?? null,
      difference: live ? (result?.difference ?? null) : item.differenceQty,
      currentOnHand: live
        ? ((
            current.get(levelKey({ variantId: item.variantId, locationId: count.locationId })) as
              { onHand: number } | undefined
          )?.onHand ?? 0)
        : null,
      applied: item.movementId !== null,
    };
  });
  const status = count.status as CountStatus;
  return {
    count: { ...count, items: undefined },
    lines,
    uncounted: lines.filter((line) => line.countedQty === null).length,
    can: {
      record: status === "IN_PROGRESS" && hasPermission(actor, "inventory.count"),
      submit: status === "IN_PROGRESS" && hasPermission(actor, "inventory.count"),
      apply: status === "SUBMITTED" && hasPermission(actor, "inventory.count.apply"),
      cancel:
        (status === "IN_PROGRESS" || status === "SUBMITTED") &&
        (hasPermission(actor, "inventory.count") || hasPermission(actor, "inventory.count.apply")),
    },
  };
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export async function startCount(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "inventory.count");
  const data = parse(countStartSchema, input);
  assertLocationAccess(actor, data.locationId);
  const location = await findLocationById(data.locationId);
  if (location === null) throw new AppError("NOT_FOUND", "Location not found.");
  if (!location.isActive) throw new AppError("VALIDATION_FAILED", `${location.code} is inactive.`);
  const categoryIds =
    data.categoryId === undefined ? undefined : await findCategoryWithDescendants(data.categoryId);
  if (categoryIds !== undefined && categoryIds.length === 0) {
    throw new AppError("VALIDATION_FAILED", "That category no longer exists.");
  }

  const open = await findOpenCountAt(location.id);
  if (open !== null)
    throw conflict(
      `${open.reference} is still open at ${location.code}. Finish or cancel it first.`,
    );

  try {
    return await runInventoryTransaction(
      async (uow) => {
        const reference = await nextDocumentReference(uow, "count");
        const snapshot = await snapshotLevels(uow, location.id, categoryIds);
        const created = await createStockCount(uow, {
          reference,
          locationId: location.id,
          categoryId: data.categoryId ?? null,
          note: data.note,
          createdByUserId: actor.userId,
          startedAt: snapshot.at,
          items: snapshot.rows.map((row) => ({ variantId: row.variantId, systemQty: row.onHand })),
        });
        await uow.audit({
          userId: actor.userId,
          action: AUDIT_ACTIONS.stockCountStarted,
          entityType: "stock_count",
          entityId: created.id,
          locationId: location.id,
          after: {
            reference,
            location: location.code,
            categoryId: data.categoryId ?? null,
            lines: snapshot.rows.length,
          },
          ...meta,
        });
        return created;
      },
      { timeoutMs: 60_000 },
    );
  } catch (error) {
    if (isOpenCountConflict(error)) throw conflict(`A count is already open at ${location.code}.`);
    throw error;
  }
}

/**
 * A scan adds 1 to the item (adding it to the count, snapshotted now, the
 * first time); "set" stores a hand-counted number. Unknown codes are refused.
 */
export async function recordCount(actor: StaffContext, input: unknown) {
  assertPermission(actor, "inventory.count");
  const data = parse(countRecordSchema, input);

  let variantId: string;
  let sku: string;
  if (data.mode === "scan") {
    const variant = await findVariantByCode(data.code);
    if (variant === null || variant.deletedAt !== null || variant.product.deletedAt !== null) {
      throw new AppError("NOT_FOUND", `No item has the barcode or SKU "${data.code}".`);
    }
    variantId = variant.id;
    sku = variant.sku;
  } else {
    variantId = data.variantId;
    sku = "";
  }

  // Category scope is checked before the transaction (reads use their own connection).
  const header = await findStockCount(data.countId);
  if (header === null) throw notFound();
  assertLocationAccess(actor, header.locationId);
  const inScope =
    header.categoryId === null ||
    header.items.some((item) => item.variantId === variantId) ||
    (await isVariantInCategories(variantId, await findCategoryWithDescendants(header.categoryId)));

  return runInventoryTransaction(async (uow) => {
    const count = await lockedCount(uow, actor, data.countId);
    if (count.status !== "IN_PROGRESS")
      throw conflict("This count is no longer open for counting.");

    let item = count.items.find((candidate) => candidate.variantId === variantId);
    if (item === undefined) {
      if (!inScope) {
        throw new AppError(
          "VALIDATION_FAILED",
          `${sku || "This item"} is outside this count's category.`,
        );
      }
      // Snapshot this item now, under a share lock, like the count start did.
      const levels = await uow.lockLevels([{ variantId, locationId: count.locationId }], "share");
      const at = await clock(uow);
      const created = await addCountItem(uow, {
        stockCountId: count.id,
        variantId,
        systemQty: levels.get(levelKey({ variantId, locationId: count.locationId }))?.onHand ?? 0,
        snapshotAt: at,
      });
      item = {
        id: created.id,
        variantId,
        systemQty: 0,
        snapshotAt: at,
        countedQty: null,
        countedAt: null,
      };
    }

    const saved =
      data.mode === "set"
        ? await recordCountedQty(uow, item.id, { set: data.countedQty })
        : item.countedQty === null
          ? await startCountedQty(uow, item.id, 1)
          : await recordCountedQty(uow, item.id, { increment: 1 });
    return { itemId: saved.id, variantId, sku, countedQty: saved.countedQty ?? 0 };
  });
}

async function reconcile(
  uow: InventoryUnitOfWork,
  locationId: string,
  items: ReadonlyArray<{
    id: string;
    variantId: string;
    systemQty: number;
    snapshotAt: Date;
    countedQty: number;
    countedAt: Date;
  }>,
) {
  const movements = await sumMovementsSinceSnapshot(
    uow,
    locationId,
    items.map((item) => ({
      variantId: item.variantId,
      snapshotAt: item.snapshotAt,
      cutoff: item.countedAt,
    })),
  );
  return items.map((item) => {
    const since = movements.get(item.variantId) ?? 0;
    const { difference } = reconcileCountLine({
      systemQty: item.systemQty,
      movementsSinceSnapshot: since,
      countedQty: item.countedQty,
    });
    return { ...item, movementsSinceSnapshot: since, differenceQty: difference };
  });
}

function countedItems<T extends { countedQty: number | null; countedAt: Date | null }>(
  items: readonly T[],
) {
  return items.flatMap((item) =>
    item.countedQty === null || item.countedAt === null
      ? []
      : [{ ...item, countedQty: item.countedQty, countedAt: item.countedAt }],
  );
}

export async function submitCount(actor: StaffContext, countId: string, meta: RequestMeta) {
  assertPermission(actor, "inventory.count");
  return runInventoryTransaction(async (uow) => {
    const count = await lockedCount(uow, actor, countId);
    if (count.status !== "IN_PROGRESS")
      throw conflict("Only a count in progress can be submitted.");
    const counted = countedItems(count.items);
    if (counted.length === 0)
      throw new AppError("VALIDATION_FAILED", "Nothing has been counted yet.");
    const lines = await reconcile(uow, count.locationId, counted);
    await saveCountLineResults(
      uow,
      lines.map((line) => ({
        itemId: line.id,
        countedQty: line.countedQty,
        countedAt: line.countedAt,
        movementsSinceSnapshot: line.movementsSinceSnapshot,
        differenceQty: line.differenceQty,
      })),
    );
    await updateStockCount(uow, count.id, {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedByUserId: actor.userId,
    });
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.stockCountSubmitted,
      entityType: "stock_count",
      entityId: count.id,
      locationId: count.locationId,
      after: {
        reference: count.reference,
        counted: counted.length,
        uncounted: count.items.length - counted.length,
        differences: lines.filter((line) => line.differenceQty !== 0).length,
      },
      ...meta,
    });
    return { id: count.id, uncounted: count.items.length - counted.length };
  });
}

/**
 * Store Manager applies the corrections as COUNT_CORRECTION movements.
 * `zeroUncounted` (with its confirmation) sets every uncounted line of this
 * count — and only this count's category scope — to 0 first.
 */
export async function applyCount(actor: StaffContext, input: unknown, meta: RequestMeta) {
  assertPermission(actor, "inventory.count.apply");
  const data = parse(countApplySchema, input);
  if (data.zeroUncounted && !data.confirmZeroUncounted) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Confirm that every uncounted item in this count should be set to 0.",
      { details: { field: "confirmZeroUncounted", needsConfirmation: true } },
    );
  }
  return runInventoryTransaction(
    async (uow) => {
      const count = await lockedCount(uow, actor, data.countId);
      if (count.status !== "SUBMITTED") throw conflict("Only a submitted count can be applied.");

      const now = await clock(uow);
      const items = count.items.map((item) =>
        item.countedQty === null && data.zeroUncounted
          ? { ...item, countedQty: 0, countedAt: now }
          : item,
      );
      const counted = countedItems(items);
      const lines = await reconcile(uow, count.locationId, counted);
      const corrections = lines.filter((line) => line.differenceQty !== 0);
      const applied = await applyStockMovements(
        uow,
        corrections.map((line) => ({
          variantId: line.variantId,
          locationId: count.locationId,
          type: "COUNT_CORRECTION" as const,
          quantity: line.differenceQty,
          reasonCode: "COUNT",
          reason: count.reference,
          referenceType: "STOCK_COUNT",
          referenceId: count.id,
          userId: actor.userId,
        })),
      );
      const movementByVariant = new Map(
        applied.map((movement) => [movement.variantId, movement.movementId]),
      );
      await saveCountLineResults(
        uow,
        lines.map((line) => ({
          itemId: line.id,
          countedQty: line.countedQty,
          countedAt: line.countedAt,
          movementsSinceSnapshot: line.movementsSinceSnapshot,
          differenceQty: line.differenceQty,
          movementId: movementByVariant.get(line.variantId) ?? null,
        })),
      );
      await updateStockCount(uow, count.id, {
        status: "APPLIED",
        completedAt: now,
        appliedByUserId: actor.userId,
      });
      await uow.audit({
        userId: actor.userId,
        action: AUDIT_ACTIONS.stockCountApplied,
        entityType: "stock_count",
        entityId: count.id,
        locationId: count.locationId,
        after: {
          reference: count.reference,
          corrections: corrections.map((line) => ({
            variantId: line.variantId,
            difference: line.differenceQty,
          })),
          zeroedUncounted: data.zeroUncounted
            ? count.items.filter((item) => item.countedQty === null).length
            : 0,
          leftUncounted: items.filter((item) => item.countedQty === null).length,
        },
        ...meta,
      });
      return { id: count.id, corrections: corrections.length };
    },
    { timeoutMs: 60_000 },
  );
}

export async function cancelCount(actor: StaffContext, countId: string, meta: RequestMeta) {
  if (!hasPermission(actor, "inventory.count.apply")) assertPermission(actor, "inventory.count");
  return runInventoryTransaction(async (uow) => {
    const count = await lockedCount(uow, actor, countId);
    if (count.status !== "IN_PROGRESS" && count.status !== "SUBMITTED") {
      throw conflict("This count is already closed.");
    }
    await updateStockCount(uow, count.id, { status: "CANCELLED", cancelledAt: new Date() });
    await uow.audit({
      userId: actor.userId,
      action: AUDIT_ACTIONS.stockCountCancelled,
      entityType: "stock_count",
      entityId: count.id,
      locationId: count.locationId,
      before: { status: count.status },
      after: { reference: count.reference, status: "CANCELLED" },
      ...meta,
    });
    return { id: count.id };
  });
}
