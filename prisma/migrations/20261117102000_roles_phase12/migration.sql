-- Phase 12 role update, approved by the owner on 2026-11-15 (plan section 14).
-- Additive only: no key is removed and custom roles are untouched. Each change
-- is written to the audit log with the full before and after permission lists.
--
--   Super Admin:    report.export, content.publish, role.manage, audit.export,
--                   catalog.import, catalog.export
--   Store Manager:  report.export, content.publish, audit.export, catalog.import,
--                   catalog.export (no role.manage, settings.write or staff.manage)
--   Branch Manager: report.export (own branches only)
--   Others:         unchanged
WITH before AS (
  SELECT "id", "name", "permissions"
  FROM "Role"
  WHERE "isSystem" = true
    AND "deletedAt" IS NULL
    AND "name" IN ('Super Admin', 'Store Manager', 'Branch Manager')
),
target AS (
  SELECT
    b."id",
    ARRAY(
      SELECT DISTINCT p FROM unnest(
        b."permissions" || CASE b."name"
          WHEN 'Super Admin' THEN ARRAY['report.export', 'content.publish', 'role.manage', 'audit.export', 'catalog.import', 'catalog.export']
          WHEN 'Store Manager' THEN ARRAY['report.export', 'content.publish', 'audit.export', 'catalog.import', 'catalog.export']
          WHEN 'Branch Manager' THEN ARRAY['report.export']
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
  WHERE r."id" = t."id" AND r."permissions" IS DISTINCT FROM t."permissions"
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
  jsonb_build_object('name', u."name", 'permissions', to_jsonb(u."permissions"), 'via', 'migration 20261117102000_roles_phase12'),
  CURRENT_TIMESTAMP
FROM updated AS u
JOIN before AS b ON b."id" = u."id";
