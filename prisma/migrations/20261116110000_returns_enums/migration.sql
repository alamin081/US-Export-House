-- Phase 9 step B-2 (approved by the owner on 2026-11-15). Enum changes only,
-- in their own migration (ADD VALUE cannot be used in the same transaction).
-- Values are only added; MFS stays (deprecated, unused).
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'EXCHANGE_CREDIT';
ALTER TYPE "RefundMethod" ADD VALUE IF NOT EXISTS 'BKASH';
ALTER TYPE "RefundMethod" ADD VALUE IF NOT EXISTS 'NAGAD';
ALTER TYPE "RefundMethod" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "InspectionResult" ADD VALUE IF NOT EXISTS 'DAMAGED';

CREATE TYPE "ReturnType" AS ENUM ('RETURN', 'EXCHANGE');
CREATE TYPE "ReturnReason" AS ENUM ('SIZE_MISMATCH', 'DEFECTIVE', 'WRONG_ITEM', 'CHANGED_MIND', 'OTHER');
CREATE TYPE "ReturnSource" AS ENUM ('CUSTOMER', 'STAFF');
