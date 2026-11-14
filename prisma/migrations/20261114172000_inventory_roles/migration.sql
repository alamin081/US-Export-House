-- Phase 7 role update, approved by the owner on 2026-11-14 (plan section 7).
-- Only system roles change. `stockcount.manage` becomes `inventory.count`, and
-- the new inventory keys are granted as below. Each change is written to the
-- audit log with the full before and after permission lists.
--
--   Super Admin, Store Manager: location.manage, inventory.receive,
--     inventory.count, inventory.count.apply, inventory.cost.read, transfer.approve
--   Inventory Staff: inventory.receive, inventory.count
--   Branch Manager:  inventory.count (no receive: goods arrive at the warehouse)
--   Branch Sales Staff, Order Staff, Content Editor: unchanged
WITH before AS (
  SELECT "id", "name", "permissions"
  FROM "Role"
  WHERE "isSystem" = true
    AND "deletedAt" IS NULL
    AND "name" IN ('Super Admin', 'Store Manager', 'Inventory Staff', 'Branch Manager')
),
target AS (
  SELECT
    b."id",
    ARRAY(
      SELECT DISTINCT p FROM unnest(
        array_remove(b."permissions", 'stockcount.manage') || CASE b."name"
          WHEN 'Super Admin' THEN ARRAY['location.manage', 'inventory.receive', 'inventory.count', 'inventory.count.apply', 'inventory.cost.read', 'transfer.approve']
          WHEN 'Store Manager' THEN ARRAY['location.manage', 'inventory.receive', 'inventory.count', 'inventory.count.apply', 'inventory.cost.read', 'transfer.approve']
          WHEN 'Inventory Staff' THEN ARRAY['inventory.receive', 'inventory.count']
          WHEN 'Branch Manager' THEN ARRAY['inventory.count']
        END
      ) AS p
      ORDER BY p
    ) AS permissions
  FROM before AS b
),
updated AS (
  UPDATE "Role" AS r
  SET "permissions" = t."permissions", "updatedAt" = CURRENT_TIMESTAMP
  FROM target AS t
  WHERE r."id" = t."id"
  RETURNING r."id", r."name", r."permissions"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT
  'mig_' || md5(u."id" || clock_timestamp()::text || random()::text),
  NULL,
  'role.permissions_changed',
  'role',
  u."id",
  jsonb_build_object('name', u."name", 'permissions', to_jsonb(b."permissions")),
  jsonb_build_object('name', u."name", 'permissions', to_jsonb(u."permissions"), 'via', 'migration 20261114172000_inventory_roles'),
  CURRENT_TIMESTAMP
FROM updated AS u
JOIN before AS b ON b."id" = u."id";
