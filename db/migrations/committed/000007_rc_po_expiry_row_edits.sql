ALTER TABLE procurement.case_awards
  ADD COLUMN IF NOT EXISTS tentative_tendering_date date,
  ADD COLUMN IF NOT EXISTS tender_floated_or_not_required boolean NOT NULL DEFAULT false;

ALTER TABLE reporting.contract_expiry_facts
  ADD COLUMN IF NOT EXISTS case_award_id uuid REFERENCES procurement.case_awards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS contract_expiry_facts_case_award_idx
  ON reporting.contract_expiry_facts (tenant_id, case_award_id)
  WHERE case_award_id IS NOT NULL;
