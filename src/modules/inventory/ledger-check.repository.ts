import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Read-only ledger consistency checks, shared by `npm run inventory:verify`
 * and the integration tests (so it takes the client instead of importing the
 * app's server-only one).
 *
 *   1. onHand   = sum of every movement except RESERVE / RELEASE
 *   2. reserved = sum of RESERVE / RELEASE movements
 *   3. no ledger rows without a stock row
 *   4. transfers: what left the source equals what was sent; what arrived
 *      plus the discrepancy equals what was received
 */

type Reader = Pick<PrismaClient, "$queryRaw">;

export interface LedgerMismatch {
  check: string;
  detail: string;
}

export async function findLedgerMismatches(client: Reader): Promise<{
  levelsChecked: number;
  movementsChecked: number;
  transfersChecked: number;
  mismatches: LedgerMismatch[];
}> {
  const [counts] = await client.$queryRaw<
    Array<{ levels: bigint; movements: bigint; transfers: bigint }>
  >`
    SELECT (SELECT COUNT(*) FROM "InventoryLevel") AS levels,
           (SELECT COUNT(*) FROM "InventoryMovement") AS movements,
           (SELECT COUNT(*) FROM "StockTransfer" WHERE "status" IN ('DISPATCHED', 'RECEIVED')) AS transfers
  `;

  const levels = await client.$queryRaw<
    Array<{
      sku: string;
      code: string;
      onHand: number;
      reserved: number;
      ledgerOnHand: bigint;
      ledgerReserved: bigint;
    }>
  >`
    SELECT v."sku", l."code", il."onHand", il."reserved",
           COALESCE(SUM(m."quantity") FILTER (WHERE m."type" NOT IN ('RESERVE', 'RELEASE')), 0)::bigint AS "ledgerOnHand",
           COALESCE(SUM(m."quantity") FILTER (WHERE m."type" IN ('RESERVE', 'RELEASE')), 0)::bigint AS "ledgerReserved"
    FROM "InventoryLevel" il
    JOIN "ProductVariant" v ON v."id" = il."variantId"
    JOIN "Location" l ON l."id" = il."locationId"
    LEFT JOIN "InventoryMovement" m ON m."variantId" = il."variantId" AND m."locationId" = il."locationId"
    GROUP BY il."id", v."sku", l."code"
    HAVING il."onHand" <> COALESCE(SUM(m."quantity") FILTER (WHERE m."type" NOT IN ('RESERVE', 'RELEASE')), 0)
        OR il."reserved" <> COALESCE(SUM(m."quantity") FILTER (WHERE m."type" IN ('RESERVE', 'RELEASE')), 0)
    LIMIT 100
  `;

  const orphans = await client.$queryRaw<Array<{ sku: string; code: string; total: bigint }>>`
    SELECT v."sku", l."code", SUM(m."quantity")::bigint AS total
    FROM "InventoryMovement" m
    JOIN "ProductVariant" v ON v."id" = m."variantId"
    JOIN "Location" l ON l."id" = m."locationId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "InventoryLevel" il WHERE il."variantId" = m."variantId" AND il."locationId" = m."locationId"
    )
    GROUP BY v."sku", l."code"
    LIMIT 100
  `;

  const transfers = await client.$queryRaw<
    Array<{
      reference: string;
      status: string;
      sent: bigint;
      out: bigint;
      received: bigint | null;
      inbound: bigint;
      discrepancy: bigint;
    }>
  >`
    SELECT t."reference", t."status"::text AS status,
           (SELECT COALESCE(SUM(ti."quantitySent"), 0) FROM "StockTransferItem" ti WHERE ti."transferId" = t."id")::bigint AS sent,
           (SELECT SUM(ti."quantityReceived") FROM "StockTransferItem" ti WHERE ti."transferId" = t."id")::bigint AS received,
           COALESCE(-SUM(m."quantity") FILTER (WHERE m."type" = 'TRANSFER_OUT'), 0)::bigint AS out,
           COALESCE(SUM(m."quantity") FILTER (WHERE m."type" = 'TRANSFER_IN'), 0)::bigint AS inbound,
           COALESCE(SUM(m."quantity") FILTER (WHERE m."type" = 'TRANSFER_DISCREPANCY'), 0)::bigint AS discrepancy
    FROM "StockTransfer" t
    LEFT JOIN "InventoryMovement" m ON m."referenceType" = 'TRANSFER' AND m."referenceId" = t."id"
    WHERE t."status" IN ('DISPATCHED', 'RECEIVED')
    GROUP BY t."id"
  `;

  const mismatches: LedgerMismatch[] = [];
  for (const row of levels) {
    mismatches.push({
      check: "level",
      detail: `${row.sku} at ${row.code}: onHand ${row.onHand} vs ledger ${row.ledgerOnHand}, reserved ${row.reserved} vs ledger ${row.ledgerReserved}`,
    });
  }
  for (const row of orphans) {
    mismatches.push({
      check: "orphan",
      detail: `${row.sku} at ${row.code}: ledger total ${row.total} without a stock row`,
    });
  }
  for (const row of transfers) {
    if (row.out !== row.sent) {
      mismatches.push({
        check: "transfer",
        detail: `${row.reference}: sent ${row.sent}, left the source ${row.out}`,
      });
    }
    if (
      row.status === "RECEIVED" &&
      (row.inbound !== row.sent || row.inbound + row.discrepancy !== (row.received ?? 0n))
    ) {
      mismatches.push({
        check: "transfer",
        detail: `${row.reference}: sent ${row.sent}, booked in ${row.inbound}, discrepancy ${row.discrepancy}, received ${row.received}`,
      });
    }
    if (row.status === "DISPATCHED" && row.inbound !== 0n) {
      mismatches.push({
        check: "transfer",
        detail: `${row.reference}: in transit but already booked in`,
      });
    }
  }

  return {
    levelsChecked: Number(counts?.levels ?? 0),
    movementsChecked: Number(counts?.movements ?? 0),
    transfersChecked: Number(counts?.transfers ?? 0),
    mismatches,
  };
}
