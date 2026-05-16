CREATE INDEX IF NOT EXISTS tender_plan_cases_entity_planned_idx
  ON procurement.tender_plan_cases (tenant_id, entity_id, planned_date, updated_at DESC)
  WHERE deleted_at IS NULL;
