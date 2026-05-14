-- Migration 000002: Row-Level Security for multi-tenant isolation
-- Every table with a tenant_id column gets a RESTRICTIVE policy.
-- The application role reads the current tenant from a session-local variable:
--   SET LOCAL app.current_tenant_id = '<uuid>';
-- This is set by DatabaseService.withTenantContext() on every authenticated request.

-- ── Application role ────────────────────────────────────────────────────────
-- This role has no BYPASSRLS privilege, so RLS policies are always enforced.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'procuredesk_app') THEN
    CREATE ROLE procuredesk_app NOLOGIN;
  END IF;
END $$;

-- Grant schema usage and table permissions to the application role
GRANT USAGE ON SCHEMA iam, org, catalog, procurement, reporting, ops TO procuredesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA procurement TO procuredesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA org TO procuredesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops TO procuredesk_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA reporting TO procuredesk_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA iam TO procuredesk_app;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO procuredesk_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA procurement, org, ops, reporting, iam TO procuredesk_app;

-- ── Tenant context helper ────────────────────────────────────────────────────
-- Returns the UUID of the current tenant from the session-local GUC variable.
-- Returns NULL when not set (e.g., during platform-admin or migration operations).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- ── Enable RLS on tenant-scoped tables ───────────────────────────────────────

ALTER TABLE procurement.cases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.case_financials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.case_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.case_delays        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.case_awards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.rc_po_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.tender_plan_cases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting.case_facts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting.contract_expiry_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting.report_saved_views   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.outbox_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.dead_letter_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.file_assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.import_jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.import_job_rows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.export_jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.notification_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.notification_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.password_reset_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.entities                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.departments                ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- RESTRICTIVE policies combine with any permissive ones using AND.
-- When current_tenant_id() is NULL (platform admin or migration), no rows match —
-- the caller must use a superuser connection or explicitly bypass RLS.

CREATE POLICY tenant_isolation ON procurement.cases
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.case_financials
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.case_milestones
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.case_delays
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.case_awards
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.rc_po_plans
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON procurement.tender_plan_cases
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON reporting.case_facts
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON reporting.contract_expiry_facts
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON reporting.report_saved_views
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.audit_events
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.outbox_events
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.dead_letter_events
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.file_assets
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.import_jobs
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.import_job_rows
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.export_jobs
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.notification_rules
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON ops.notification_jobs
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON iam.password_reset_tokens
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON org.entities
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON org.departments
  AS RESTRICTIVE TO procuredesk_app
  USING (tenant_id = current_tenant_id());
