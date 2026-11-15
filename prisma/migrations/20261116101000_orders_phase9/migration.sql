-- Phase 9 step B-1 (approved by the owner on 2026-11-15): order processing.
-- Additive only: new columns with defaults, new tables, constraints, sequences.


-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelReason" "CancelReason",
ADD COLUMN     "confirmedByUserId" TEXT,
ADD COLUMN     "deliveryFailedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryFailedReason" TEXT,
ADD COLUMN     "packedAt" TIMESTAMP(3),
ADD COLUMN     "packedByUserId" TEXT,
ADD COLUMN     "paidPoisha" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnedToWarehouseAt" TIMESTAMP(3),
ADD COLUMN     "unreachableAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "event" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "lostChargePoisha" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderCallLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "outcome" "CallOutcome" NOT NULL,
    "note" TEXT,
    "callbackAt" TIMESTAMP(3),
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "issuedByUserId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodSettlement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "courier" "CourierProviderType" NOT NULL,
    "courierName" TEXT,
    "receivedOn" DATE NOT NULL,
    "expectedPoisha" INTEGER NOT NULL,
    "receivedPoisha" INTEGER NOT NULL,
    "courierChargePoisha" INTEGER NOT NULL DEFAULT 0,
    "differencePoisha" INTEGER NOT NULL,
    "courierReference" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodSettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "expectedPoisha" INTEGER NOT NULL,
    "receivedPoisha" INTEGER NOT NULL,

    CONSTRAINT "CodSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderCallLog_orderId_createdAt_idx" ON "OrderCallLog"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerNote_phone_createdAt_idx" ON "CustomerNote"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_version_key" ON "Invoice"("orderId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_version_key" ON "Invoice"("number", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CodSettlement_reference_key" ON "CodSettlement"("reference");

-- CreateIndex
CREATE INDEX "CodSettlement_receivedOn_idx" ON "CodSettlement"("receivedOn");

-- CreateIndex
CREATE UNIQUE INDEX "CodSettlementItem_orderId_key" ON "CodSettlementItem"("orderId");

-- CreateIndex
CREATE INDEX "CodSettlementItem_settlementId_idx" ON "CodSettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "Order_channel_status_placedAt_idx" ON "Order"("channel", "status", "placedAt");

-- AddForeignKey
ALTER TABLE "OrderCallLog" ADD CONSTRAINT "OrderCallLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodSettlementItem" ADD CONSTRAINT "CodSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CodSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodSettlementItem" ADD CONSTRAINT "CodSettlementItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodSettlementItem" ADD CONSTRAINT "CodSettlementItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: constraints Prisma cannot express
-- ---------------------------------------------------------------------------

-- Refunds can never exceed the money actually collected. Every existing row
-- has refundedPoisha = 0, so this holds before the paidPoisha backfill.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paid_nonnegative" CHECK ("paidPoisha" >= 0),
  ADD CONSTRAINT "Order_refunded_lte_paid" CHECK ("refundedPoisha" <= "paidPoisha"),
  ADD CONSTRAINT "Order_version_nonnegative" CHECK ("version" >= 0);

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_money_nonnegative" CHECK ("codAmountPoisha" >= 0 AND "lostChargePoisha" >= 0);

ALTER TABLE "CodSettlement"
  ADD CONSTRAINT "CodSettlement_money_valid" CHECK (
    "expectedPoisha" >= 0 AND "receivedPoisha" >= 0 AND "courierChargePoisha" >= 0
    AND "differencePoisha" = "receivedPoisha" + "courierChargePoisha" - "expectedPoisha"
  );

ALTER TABLE "CodSettlementItem"
  ADD CONSTRAINT "CodSettlementItem_money_nonnegative" CHECK ("expectedPoisha" >= 0 AND "receivedPoisha" >= 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_number_format" CHECK ("number" ~ '^INV-[0-9]{4}-[0-9]{5,}$'),
  ADD CONSTRAINT "Invoice_version_positive" CHECK ("version" >= 1);

-- Exactly one current version per invoice.
CREATE UNIQUE INDEX "Invoice_one_current_per_order" ON "Invoice" ("orderId") WHERE "isCurrent";

-- Document numbers: INV-YYMM-NNNNN and COD-YYMM-NNNNN.
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "cod_settlement_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
