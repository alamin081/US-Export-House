-- Phase 9 step B-3 (approved by the owner on 2026-11-15): till (POS) days,
-- held bills, till payments and refunds, staff till PIN. Additive only.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountApprovedByUserId" TEXT,
ADD COLUMN     "manualDiscountPoisha" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "posSessionId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "manualDiscountPoisha" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "changePoisha" INTEGER,
ADD COLUMN     "posSessionId" TEXT,
ADD COLUMN     "recordedByUserId" TEXT,
ADD COLUMN     "tenderedPoisha" INTEGER;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "posSessionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "posPinHash" TEXT;

-- CreateTable
CREATE TABLE "PosSession" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "counterCode" TEXT NOT NULL DEFAULT 'MAIN',
    "status" "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloatPoisha" INTEGER NOT NULL DEFAULT 0,
    "openedByUserId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedCashPoisha" INTEGER,
    "countedCashPoisha" INTEGER,
    "differencePoisha" INTEGER,
    "differenceReason" TEXT,
    "zReport" JSONB,

    CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosHeldBill" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosHeldBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosSession_reference_key" ON "PosSession"("reference");

-- CreateIndex
CREATE INDEX "PosSession_locationId_openedAt_idx" ON "PosSession"("locationId", "openedAt");

-- CreateIndex
CREATE INDEX "PosHeldBill_sessionId_createdAt_idx" ON "PosHeldBill"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_posSessionId_idx" ON "Order"("posSessionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosHeldBill" ADD CONSTRAINT "PosHeldBill_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: constraints, sequences, closed-day guards
-- ---------------------------------------------------------------------------

-- One open day per counter of a location.
CREATE UNIQUE INDEX "PosSession_one_open_per_counter"
  ON "PosSession" ("locationId", "counterCode") WHERE "status" = 'OPEN';

ALTER TABLE "PosSession"
  ADD CONSTRAINT "PosSession_float_nonnegative" CHECK ("openingFloatPoisha" >= 0),
  ADD CONSTRAINT "PosSession_counted_nonnegative" CHECK ("countedCashPoisha" IS NULL OR "countedCashPoisha" >= 0),
  ADD CONSTRAINT "PosSession_closed_complete" CHECK (
    "status" = 'OPEN'
    OR ("closedAt" IS NOT NULL AND "countedCashPoisha" IS NOT NULL AND "expectedCashPoisha" IS NOT NULL)
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_till_cash_valid" CHECK (
    ("tenderedPoisha" IS NULL AND "changePoisha" IS NULL)
    OR ("tenderedPoisha" >= 0 AND "changePoisha" >= 0 AND "tenderedPoisha" - "changePoisha" = "amountPoisha")
  );

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_manual_discount_valid"
    CHECK ("manualDiscountPoisha" >= 0 AND "manualDiscountPoisha" <= "discountPoisha");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_manual_discount_valid"
    CHECK ("manualDiscountPoisha" >= 0 AND "manualDiscountPoisha" <= "discountPoisha");

-- DAY-YYMM-NNNNN, and the shop's own EAN-13 barcodes (29 + sequence + check).
CREATE SEQUENCE IF NOT EXISTS "pos_session_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "barcode_seq" AS BIGINT START WITH 1 INCREMENT BY 1;

-- A closed till day's bills cannot change: no new sale, payment or refund on
-- it, and no change to the money, lines or status of its sales. (Refunds of
-- those sales are recorded on today's day; the sale's refunded total and
-- payment status may still move.)
CREATE FUNCTION pos_session_closed(session_id text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM "PosSession" WHERE "id" = session_id AND "status" = 'CLOSED')
  $$;

CREATE FUNCTION pos_guard_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."posSessionId" IS NOT NULL AND pos_session_closed(NEW."posSessionId") THEN
      RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."posSessionId" IS NOT NULL AND pos_session_closed(OLD."posSessionId") AND (
       NEW."posSessionId" IS DISTINCT FROM OLD."posSessionId"
    OR NEW."subtotalPoisha" <> OLD."subtotalPoisha"
    OR NEW."discountPoisha" <> OLD."discountPoisha"
    OR NEW."manualDiscountPoisha" <> OLD."manualDiscountPoisha"
    OR NEW."shippingPoisha" <> OLD."shippingPoisha"
    OR NEW."totalPoisha" <> OLD."totalPoisha"
    OR NEW."paidPoisha" <> OLD."paidPoisha"
    OR NEW."status" <> OLD."status"
    OR NEW."locationId" <> OLD."locationId"
  ) THEN
    RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Order_pos_day_guard" BEFORE INSERT OR UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION pos_guard_order();

CREATE FUNCTION pos_guard_order_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_id text;
BEGIN
  SELECT "posSessionId" INTO session_id FROM "Order"
    WHERE "id" = COALESCE(NEW."orderId", OLD."orderId");
  IF session_id IS NOT NULL AND pos_session_closed(session_id) THEN
    RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER "OrderItem_pos_day_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION pos_guard_order_item();

CREATE FUNCTION pos_guard_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."posSessionId" IS NOT NULL AND pos_session_closed(NEW."posSessionId") THEN
      RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."posSessionId" IS NOT NULL AND pos_session_closed(OLD."posSessionId") AND (
       NEW."posSessionId" IS DISTINCT FROM OLD."posSessionId"
    OR NEW."amountPoisha" <> OLD."amountPoisha"
    OR NEW."provider" <> OLD."provider"
    OR NEW."tenderedPoisha" IS DISTINCT FROM OLD."tenderedPoisha"
    OR NEW."changePoisha" IS DISTINCT FROM OLD."changePoisha"
  ) THEN
    RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Payment_pos_day_guard" BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION pos_guard_payment();

CREATE FUNCTION pos_guard_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."posSessionId" IS NOT NULL AND pos_session_closed(NEW."posSessionId") THEN
      RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."posSessionId" IS NOT NULL AND pos_session_closed(OLD."posSessionId") AND (
       NEW."posSessionId" IS DISTINCT FROM OLD."posSessionId"
    OR NEW."amountPoisha" <> OLD."amountPoisha"
    OR NEW."method" <> OLD."method"
  ) THEN
    RAISE EXCEPTION 'POS_DAY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Refund_pos_day_guard" BEFORE INSERT OR UPDATE ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION pos_guard_refund();
