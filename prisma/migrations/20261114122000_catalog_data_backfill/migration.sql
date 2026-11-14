-- Phase 6 data backfill, approved by the owner on 2026-11-14 (B2 and B3).
-- Runs after 20261114121000_catalog_phase6. Touches only the rows named below.

-- ---------------------------------------------------------------------------
-- B2. Option-combination key for every existing variant, then the guard.
-- Duplicate combinations were checked before writing this: none.
-- ---------------------------------------------------------------------------
UPDATE "ProductVariant" AS v
SET "optionKey" = k.key
FROM (
  SELECT "variantId", string_agg("optionValueId", '+' ORDER BY "optionValueId") AS key
  FROM "ProductVariantOption"
  GROUP BY "variantId"
) AS k
WHERE k."variantId" = v."id" AND v."optionKey" IS NULL;

-- A variant without options gets the empty key, so it is unique per product too.
UPDATE "ProductVariant" SET "optionKey" = '' WHERE "optionKey" IS NULL;

-- One live variant per option combination per product. Archived (soft-deleted)
-- variants are excluded, so a combination can be re-created after archiving.
CREATE UNIQUE INDEX "ProductVariant_product_optionKey_live_key"
  ON "ProductVariant" ("productId", "optionKey")
  WHERE "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- B3. System roles move from product.read / product.write / category.write to
-- the catalog.* keys. Only rows with "isSystem" = true change. Each change is
-- written to the audit log with the full before and after permission lists.
-- ---------------------------------------------------------------------------
WITH before AS (
  SELECT "id", "name", "permissions" FROM "Role" WHERE "isSystem" = true AND "deletedAt" IS NULL
),
target AS (
  SELECT
    b."id",
    ARRAY(
      SELECT p FROM unnest(b."permissions") AS p
      WHERE p NOT IN ('product.read', 'product.write', 'category.write')
    ) || CASE b."name"
      WHEN 'Super Admin' THEN ARRAY['catalog.read', 'catalog.write', 'catalog.content', 'catalog.price.write', 'catalog.publish', 'catalog.delete']
      WHEN 'Store Manager' THEN ARRAY['catalog.read', 'catalog.write', 'catalog.content', 'catalog.price.write', 'catalog.publish', 'catalog.delete']
      WHEN 'Content Editor' THEN ARRAY['catalog.read', 'catalog.content']
      ELSE ARRAY['catalog.read']
    END AS permissions
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
  jsonb_build_object('name', u."name", 'permissions', to_jsonb(u."permissions"), 'via', 'migration 20261114122000_catalog_data_backfill'),
  CURRENT_TIMESTAMP
FROM updated AS u
JOIN before AS b ON b."id" = u."id";
