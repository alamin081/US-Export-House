-- Phase 12 (reports), additive only: when an order counts as a sale, the
-- purchase cost snapshot of each sold line, and indexes for date-range reports.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "soldAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitCostPoisha" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryMovement_type_locationId_createdAt_idx" ON "InventoryMovement"("type", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_soldAt_idx" ON "Order"("soldAt");

-- CreateIndex
CREATE INDEX "Order_channel_locationId_soldAt_idx" ON "Order"("channel", "locationId", "soldAt");

-- CreateIndex
CREATE INDEX "Refund_status_processedAt_idx" ON "Refund"("status", "processedAt");

