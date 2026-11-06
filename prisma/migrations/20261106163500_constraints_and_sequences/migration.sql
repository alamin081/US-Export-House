-- Guard rails that Prisma schema syntax cannot express.
--
-- These are deliberately enforced by PostgreSQL, not only by application code:
-- a bug, a raw query or a future service must not be able to leave the stock
-- ledger or an order's money in an impossible state.

-- ---------------------------------------------------------------------------
-- 1. Stock can never go negative, and never reserve more than is on hand.
--    The Phase 7/8 services use a conditional UPDATE
--    (WHERE "onHand" - "reserved" >= :qty); this constraint is the backstop.
-- ---------------------------------------------------------------------------
ALTER TABLE "InventoryLevel"
  ADD CONSTRAINT "InventoryLevel_onHand_nonnegative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "InventoryLevel_reserved_nonnegative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "InventoryLevel_reserved_lte_onHand" CHECK ("reserved" <= "onHand");

-- A movement of zero is meaningless; the sign carries the direction.
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_quantity_nonzero" CHECK ("quantity" <> 0);

-- ---------------------------------------------------------------------------
-- 2. Money is integer poisha and is never negative. Quantities are positive.
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("pricePoisha" >= 0),
  ADD CONSTRAINT "ProductVariant_comparePrice_nonnegative"
    CHECK ("comparePricePoisha" IS NULL OR "comparePricePoisha" >= 0),
  ADD CONSTRAINT "ProductVariant_cost_nonnegative"
    CHECK ("costPoisha" IS NULL OR "costPoisha" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_money_nonnegative" CHECK (
    "subtotalPoisha" >= 0
    AND "discountPoisha" >= 0
    AND "shippingPoisha" >= 0
    AND "totalPoisha" >= 0
    AND "refundedPoisha" >= 0
  ),
  -- The order total must always be the sum of its parts.
  ADD CONSTRAINT "Order_total_is_consistent" CHECK (
    "totalPoisha" = "subtotalPoisha" - "discountPoisha" + "shippingPoisha"
  ),
  -- A discount can never exceed the goods value.
  ADD CONSTRAINT "Order_discount_lte_subtotal" CHECK ("discountPoisha" <= "subtotalPoisha"),
  -- Refunds can never exceed what was charged.
  ADD CONSTRAINT "Order_refunded_lte_total" CHECK ("refundedPoisha" <= "totalPoisha");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_price_nonnegative" CHECK ("unitPricePoisha" >= 0),
  ADD CONSTRAINT "OrderItem_lineTotal_is_consistent"
    CHECK ("lineTotalPoisha" = "unitPricePoisha" * "quantity");

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_nonnegative" CHECK ("amountPoisha" >= 0);

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountPoisha" > 0);

ALTER TABLE "ShippingZone"
  ADD CONSTRAINT "ShippingZone_rate_nonnegative" CHECK ("ratePoisha" >= 0),
  ADD CONSTRAINT "ShippingZone_freeThreshold_nonnegative"
    CHECK ("freeThresholdPoisha" IS NULL OR "freeThresholdPoisha" >= 0);

ALTER TABLE "StockTransferItem"
  ADD CONSTRAINT "StockTransferItem_quantitySent_positive" CHECK ("quantitySent" > 0),
  ADD CONSTRAINT "StockTransferItem_quantityReceived_valid"
    CHECK ("quantityReceived" IS NULL OR ("quantityReceived" >= 0 AND "quantityReceived" <= "quantitySent"));

ALTER TABLE "ReturnItem"
  ADD CONSTRAINT "ReturnItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- A percentage coupon must be 1-100; a fixed coupon is an amount in poisha.
ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_valid" CHECK (
    ("type" = 'PERCENTAGE' AND "value" BETWEEN 1 AND 100)
    OR ("type" = 'FIXED' AND "value" > 0)
  ),
  ADD CONSTRAINT "Coupon_usedCount_nonnegative" CHECK ("usedCount" >= 0);

-- A transfer must move stock between two different locations.
ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_locations_differ" CHECK ("fromLocationId" <> "toLocationId");

-- ---------------------------------------------------------------------------
-- 3. Single-default invariants, as partial unique indexes.
-- ---------------------------------------------------------------------------

-- Exactly one location may be the default for online fulfilment.
CREATE UNIQUE INDEX "Location_one_default_online_fulfillment"
  ON "Location" (("isDefaultOnlineFulfillment"))
  WHERE "isDefaultOnlineFulfillment" = true;

-- Exactly one shipping zone may be the default.
CREATE UNIQUE INDEX "ShippingZone_one_default"
  ON "ShippingZone" (("isDefault"))
  WHERE "isDefault" = true;

-- One default address per customer.
CREATE UNIQUE INDEX "Address_one_default_per_user"
  ON "Address" ("userId")
  WHERE "isDefault" = true;

-- Coupon codes are case-insensitive in practice, so reserve them that way.
CREATE UNIQUE INDEX "Coupon_code_lower_key" ON "Coupon" (lower("code"));

-- ---------------------------------------------------------------------------
-- 4. Human-readable order numbers (UEH-2026-001).
--    A sequence guarantees uniqueness without a table lock, and the Phase 8
--    order service formats it as UEH-<year>-<padded sequence>.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1;

-- Reference sequences for stock transfers, stock counts and returns.
CREATE SEQUENCE IF NOT EXISTS "transfer_reference_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "stock_count_reference_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "return_reference_seq" AS BIGINT START WITH 1 INCREMENT BY 1;

-- ---------------------------------------------------------------------------
-- 5. Case-insensitive lookups the storefront and admin rely on.
-- ---------------------------------------------------------------------------
CREATE INDEX "Product_nameEn_lower_idx" ON "Product" (lower("nameEn"));
CREATE INDEX "ProductVariant_sku_lower_idx" ON "ProductVariant" (lower("sku"));
