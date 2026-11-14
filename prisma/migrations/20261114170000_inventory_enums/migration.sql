-- Phase 7 (approved by the owner on 2026-11-14). Enum changes only, kept in
-- their own migration: Postgres cannot use a value added by ADD VALUE in the
-- same transaction, and the next migration's indexes and defaults use them.
-- Hand-written: Prisma would drop and recreate the renamed enum instead.
-- Checked read-only first: StockCount, StockCountItem, StockTransfer and
-- StockTransferItem had 0 rows; no movement used 'ADJUSTMENT'.

-- Ledger types. 'ADJUSTMENT' stays (deprecated, unused): values are never dropped.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'OPENING';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_DISCREPANCY';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'COUNT_CORRECTION';

-- Optional approval step for transfers (setting transfer.requireApproval).
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'DISPATCHED';

-- Stock count states: IN_PROGRESS -> SUBMITTED -> APPLIED (or CANCELLED).
ALTER TYPE "StockCountStatus" RENAME VALUE 'COUNTING' TO 'IN_PROGRESS';
ALTER TYPE "StockCountStatus" RENAME VALUE 'COMPLETED' TO 'APPLIED';
ALTER TYPE "StockCountStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED' BEFORE 'APPLIED';

-- New enums for Phase 7 tables and columns.
CREATE TYPE "TransferDiscrepancyReason" AS ENUM ('LOST', 'DAMAGED', 'WRONG_ITEM', 'EXCESS');
CREATE TYPE "StockReceiptKind" AS ENUM ('OPENING', 'PURCHASE');
CREATE TYPE "StockReceiptSource" AS ENUM ('MANUAL', 'CSV');
