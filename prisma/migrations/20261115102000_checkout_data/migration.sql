-- Phase 8 data changes, approved by the owner on 2026-11-15. Checked
-- read-only first. Each change writes its before/after values to AuditLog.
-- On a database without these rows (staging/production before
-- `npm run db:seed-reference`) the UPDATEs touch nothing.

-- ---------------------------------------------------------------------------
-- 1. Delivery zones: inside_dhaka becomes "Dhaka City" (rate unchanged), and
--    the fallback (isDefault) moves to outside_dhaka. The partial unique index
--    allows one default, so the old one is cleared first.
-- ---------------------------------------------------------------------------
WITH before AS (
  SELECT "id", "code", "nameEn", "nameBn", "ratePoisha", "isDefault"
  FROM "ShippingZone" WHERE "code" IN ('inside_dhaka', 'outside_dhaka')
),
cleared AS (
  UPDATE "ShippingZone"
  SET "nameEn" = 'Dhaka City', "nameBn" = 'ঢাকা সিটি', "isDefault" = false, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "code" = 'inside_dhaka'
  RETURNING "id"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT 'mig_' || md5(b."id" || clock_timestamp()::text || random()::text), NULL, 'shipping.zone_updated', 'shipping_zone', b."id",
       jsonb_build_object('code', b."code", 'nameEn', b."nameEn", 'nameBn', b."nameBn", 'isDefault', b."isDefault"),
       jsonb_build_object('code', b."code", 'nameEn', 'Dhaka City', 'nameBn', 'ঢাকা সিটি', 'isDefault', false,
                          'via', 'migration 20261115102000_checkout_data'),
       CURRENT_TIMESTAMP
FROM before b JOIN cleared c ON c."id" = b."id";

WITH before AS (
  SELECT "id", "code", "isDefault" FROM "ShippingZone" WHERE "code" = 'outside_dhaka'
),
updated AS (
  UPDATE "ShippingZone" SET "isDefault" = true, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "code" = 'outside_dhaka'
  RETURNING "id"
)
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "before", "after", "createdAt")
SELECT 'mig_' || md5(b."id" || clock_timestamp()::text || random()::text), NULL, 'shipping.zone_updated', 'shipping_zone', b."id",
       jsonb_build_object('code', b."code", 'isDefault', b."isDefault"),
       jsonb_build_object('code', b."code", 'isDefault', true, 'via', 'migration 20261115102000_checkout_data'),
       CURRENT_TIMESTAMP
FROM before b JOIN updated u ON u."id" = b."id";

-- ---------------------------------------------------------------------------
-- 2. System roles: new checkout permissions.
--    Super Admin, Store Manager: coupon.manage, shipping.manage,
--      checkout.settings, customer.block
--    Order Staff: customer.block
-- ---------------------------------------------------------------------------
WITH before AS (
  SELECT "id", "name", "permissions" FROM "Role"
  WHERE "isSystem" = true AND "deletedAt" IS NULL
    AND "name" IN ('Super Admin', 'Store Manager', 'Order Staff')
),
target AS (
  SELECT b."id",
         ARRAY(
           SELECT DISTINCT p FROM unnest(b."permissions" || CASE b."name"
             WHEN 'Order Staff' THEN ARRAY['customer.block']
             ELSE ARRAY['coupon.manage', 'shipping.manage', 'checkout.settings', 'customer.block']
           END) AS p ORDER BY p
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
                          'via', 'migration 20261115102000_checkout_data'),
       CURRENT_TIMESTAMP
FROM updated u JOIN before b ON b."id" = u."id";
