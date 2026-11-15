-- Phase 9 step B-1 data changes, approved by the owner on 2026-11-15.
-- Checked read-only first. Each change writes its before/after values to
-- AuditLog. On a database without these rows the statements touch nothing.

-- ---------------------------------------------------------------------------
-- 1. Order.paidPoisha for orders already marked PAID (locally: the sample
--    orders UEH-2026-002 and UEH-2026-003). Without it a refund on them would
--    be refused by Order_refunded_lte_paid.
-- ---------------------------------------------------------------------------
WITH updated AS (
  UPDATE "Order" SET "paidPoisha" = "totalPoisha", "updatedAt" = CURRENT_TIMESTAMP
  WHERE "paymentStatus" = 'PAID' AND "paidPoisha" = 0
  RETURNING "id", "orderNumber", "totalPoisha"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT 'mig_' || md5(u."id" || clock_timestamp()::text || random()::text), NULL, 'order.paid_backfilled', 'order', u."id",
       jsonb_build_object('orderNumber', u."orderNumber", 'paidPoisha', 0),
       jsonb_build_object('orderNumber', u."orderNumber", 'paidPoisha', u."totalPoisha",
                          'via', 'migration 20261116102000_orders_data'),
       CURRENT_TIMESTAMP
FROM updated u;

-- ---------------------------------------------------------------------------
-- 2. System roles: Phase 9 permissions.
--    Removed everywhere: order.process (split into order.confirm, order.edit,
--    order.fulfil) and order.refund (renamed refund.record).
--    Super Admin, Store Manager: every new key.
--    Order Staff: order.confirm, order.edit, order.fulfil, invoice.print.
--    Branch Manager: pos.discount.override, pos.day.manage, refund.record, label.print.
--    Branch Sales Staff, Inventory Staff: label.print.
-- ---------------------------------------------------------------------------
WITH before AS (
  SELECT "id", "name", "permissions" FROM "Role"
  WHERE "isSystem" = true AND "deletedAt" IS NULL
    AND "name" IN ('Super Admin', 'Store Manager', 'Order Staff', 'Branch Manager',
                   'Branch Sales Staff', 'Inventory Staff')
),
target AS (
  SELECT b."id",
         ARRAY(
           SELECT DISTINCT p FROM unnest(
             array_remove(array_remove(b."permissions", 'order.process'), 'order.refund')
             || CASE b."name"
                  WHEN 'Order Staff' THEN ARRAY['order.confirm', 'order.edit', 'order.fulfil', 'invoice.print']
                  WHEN 'Branch Manager' THEN ARRAY['pos.discount.override', 'pos.day.manage', 'refund.record', 'label.print']
                  WHEN 'Branch Sales Staff' THEN ARRAY['label.print']
                  WHEN 'Inventory Staff' THEN ARRAY['label.print']
                  ELSE ARRAY['order.confirm', 'order.edit', 'order.fulfil', 'order.cod.reconcile',
                             'refund.record', 'refund.approve', 'invoice.print', 'pos.discount.override',
                             'pos.day.manage', 'label.print', 'return.policy.publish']
                END
           ) AS p ORDER BY p
         ) AS permissions
  FROM before b
),
updated AS (
  UPDATE "Role" r SET "permissions" = t."permissions", "updatedAt" = CURRENT_TIMESTAMP
  FROM target t WHERE r."id" = t."id"
  RETURNING r."id", r."name", r."permissions"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT 'mig_' || md5(u."id" || clock_timestamp()::text || random()::text), NULL, 'role.permissions_changed', 'role', u."id",
       jsonb_build_object('name', u."name", 'permissions', to_jsonb(b."permissions")),
       jsonb_build_object('name', u."name", 'permissions', to_jsonb(u."permissions"),
                          'via', 'migration 20261116102000_orders_data'),
       CURRENT_TIMESTAMP
FROM updated u JOIN before b ON b."id" = u."id";
