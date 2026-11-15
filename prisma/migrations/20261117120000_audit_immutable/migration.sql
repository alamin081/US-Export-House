-- Phase 12: the audit log is append-only, enforced by the database
-- (approved by the owner on 2026-11-15, plan section 11.2).
--
-- UPDATE, DELETE and TRUNCATE on "AuditLog" are refused. The only exception
-- is emptying a TEST database: it needs both a database whose name ends in
-- "_test" and an explicit `SET LOCAL app.audit_purge = 'on'` in the same
-- transaction. Development ("us_export_house") and production never match.
CREATE OR REPLACE FUNCTION audit_log_purge_allowed(db_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT right(db_name, 5) = '_test'
$fn$;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF audit_log_purge_allowed(current_database())
     AND current_setting('app.audit_purge', true) = 'on' THEN
    RETURN COALESCE(OLD, NEW);
  END IF;
  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: the audit log is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
