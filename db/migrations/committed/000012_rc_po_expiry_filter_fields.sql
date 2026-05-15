ALTER TABLE reporting.contract_expiry_facts
  ADD COLUMN IF NOT EXISTS budget_type_id uuid REFERENCES catalog.reference_values(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS nature_of_work_id uuid REFERENCES catalog.reference_values(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS contract_expiry_facts_filter_idx
  ON reporting.contract_expiry_facts (
    tenant_id,
    source_deleted_at,
    tender_floated_or_not_required,
    rc_po_validity_date,
    entity_id
  );

CREATE INDEX IF NOT EXISTS contract_expiry_facts_department_idx
  ON reporting.contract_expiry_facts (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contract_expiry_facts_budget_type_idx
  ON reporting.contract_expiry_facts (tenant_id, budget_type_id)
  WHERE budget_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contract_expiry_facts_nature_of_work_idx
  ON reporting.contract_expiry_facts (tenant_id, nature_of_work_id)
  WHERE nature_of_work_id IS NOT NULL;

UPDATE reporting.contract_expiry_facts e
SET budget_type_id = c.budget_type_id,
    nature_of_work_id = c.nature_of_work_id,
    source_deleted_at = coalesce(
      (select a.deleted_at from procurement.case_awards a where a.id = e.case_award_id and a.tenant_id = e.tenant_id),
      (select p.deleted_at from procurement.rc_po_plans p where p.id = e.rc_po_plan_id and p.tenant_id = e.tenant_id),
      c.deleted_at
    )
FROM procurement.cases c
WHERE c.id = e.case_id
  AND c.tenant_id = e.tenant_id;

UPDATE reporting.contract_expiry_facts e
SET source_deleted_at = p.deleted_at
FROM procurement.rc_po_plans p
WHERE p.id = e.rc_po_plan_id
  AND p.tenant_id = e.tenant_id
  AND e.case_id IS NULL;
