-- Phase 9 step B-1 (approved by the owner on 2026-11-15). Enum changes only,
-- in their own migration: a value added by ADD VALUE cannot be used in the
-- same transaction. Values are only ever added, never renamed or dropped.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_WAREHOUSE';
ALTER TYPE "CourierProviderType" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "IntegrationMode" ADD VALUE IF NOT EXISTS 'MANUAL';

CREATE TYPE "CallOutcome" AS ENUM ('CONFIRMED', 'NO_ANSWER', 'SWITCHED_OFF', 'WRONG_NUMBER', 'CALL_BACK_LATER', 'CANCEL_REQUESTED');
CREATE TYPE "CancelReason" AS ENUM ('CUSTOMER_DECLINED', 'FAKE_ORDER', 'UNREACHABLE', 'OUT_OF_STOCK', 'OTHER');
