-- Phase 12 soldAt backfill, approved by the owner on 2026-11-15.
-- Fills only the new "soldAt" column of orders that already count as a sale.
-- Source: online = the first invoice (issued with the sale at SHIPPED), else
-- shippedAt (the seed orders predate invoices); in store = placedAt.
-- Each changed order gets an AuditLog row with before/after. Cancelled and
-- pending orders are untouched; running on a database without such orders
-- changes nothing. unitCostPoisha is deliberately NOT backfilled.
WITH source AS (
  SELECT
    o."id",
    CASE
      WHEN o."channel" = 'STORE' THEN o."placedAt"
      ELSE COALESCE(
        (SELECT i."issuedAt" FROM "Invoice" i WHERE i."orderId" = o."id" AND i."version" = 1),
        o."shippedAt"
      )
    END AS sold_at
  FROM "Order" o
  WHERE o."soldAt" IS NULL
    AND o."status" IN ('SHIPPED', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_WAREHOUSE')
),
updated AS (
  UPDATE "Order" AS o
  SET "soldAt" = s.sold_at
  FROM source AS s
  WHERE o."id" = s."id" AND s.sold_at IS NOT NULL
  RETURNING o."id", o."orderNumber", o."soldAt"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT
  'mig_' || md5(u."id" || clock_timestamp()::text || random()::text),
  NULL,
  'order.sold_at_backfilled',
  'order',
  u."id",
  jsonb_build_object('orderNumber', u."orderNumber", 'soldAt', NULL),
  jsonb_build_object('orderNumber', u."orderNumber", 'soldAt', u."soldAt", 'via', 'migration 20261117101000_reports_data'),
  CURRENT_TIMESTAMP
FROM updated AS u;
