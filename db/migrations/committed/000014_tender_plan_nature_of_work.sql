ALTER TABLE procurement.tender_plan_cases
  ADD COLUMN IF NOT EXISTS nature_of_work_id uuid REFERENCES catalog.reference_values(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS tender_plan_cases_nature_of_work_idx
  ON procurement.tender_plan_cases (tenant_id, nature_of_work_id)
  WHERE deleted_at IS NULL AND nature_of_work_id IS NOT NULL;
