-- Phase 9 step B-2 (approved by the owner on 2026-11-15): returns, exchanges,
-- refunds and return photos. Additive only.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "exchangeOfOrderId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnRequestId" TEXT,
ADD COLUMN     "shippingRefundPoisha" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN     "creditPoisha" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeVariantId" TEXT;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "closedByUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "exchangeOrderId" TEXT,
ADD COLUMN     "outsideWindowNote" TEXT,
ADD COLUMN     "reasonCode" "ReturnReason",
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "source" "ReturnSource" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "type" "ReturnType" NOT NULL DEFAULT 'RETURN';

-- CreateTable
CREATE TABLE "ReturnPhoto" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnPhoto_returnRequestId_idx" ON "ReturnPhoto"("returnRequestId");

-- CreateIndex
CREATE INDEX "Order_exchangeOfOrderId_idx" ON "Order"("exchangeOfOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_exchangeOrderId_key" ON "ReturnRequest"("exchangeOrderId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_exchangeOrderId_fkey" FOREIGN KEY ("exchangeOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written constraints
-- ---------------------------------------------------------------------------
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_shipping_within_amount"
    CHECK ("shippingRefundPoisha" >= 0 AND "shippingRefundPoisha" <= "amountPoisha"),
  -- A reference (bKash/Nagad/bank transaction id) is required except for cash.
  ADD CONSTRAINT "Refund_reference_unless_cash"
    CHECK ("method" = 'CASH' OR "status" IN ('PENDING', 'REJECTED') OR "reference" IS NOT NULL);

ALTER TABLE "ReturnItem"
  ADD CONSTRAINT "ReturnItem_credit_nonnegative" CHECK ("creditPoisha" >= 0);
