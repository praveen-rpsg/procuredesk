ALTER TABLE procurement.rc_po_plans
  ADD COLUMN IF NOT EXISTS nature_of_work_id uuid REFERENCES catalog.reference_values(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS rc_po_plans_nature_of_work_idx
  ON procurement.rc_po_plans (tenant_id, nature_of_work_id)
  WHERE deleted_at IS NULL AND nature_of_work_id IS NOT NULL;
