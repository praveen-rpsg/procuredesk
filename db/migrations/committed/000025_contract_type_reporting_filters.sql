ALTER TABLE procurement.cases
  ADD COLUMN IF NOT EXISTS contract_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cases_contract_type_check'
      AND conrelid = 'procurement.cases'::regclass
  ) THEN
    ALTER TABLE procurement.cases
      ADD CONSTRAINT cases_contract_type_check
        CHECK (contract_type IS NULL OR contract_type IN ('PO', 'RC')) NOT VALID;
  END IF;
END $$;

ALTER TABLE procurement.cases VALIDATE CONSTRAINT cases_contract_type_check;

ALTER TABLE reporting.case_facts
  ADD COLUMN IF NOT EXISTS contract_type text;

ALTER TABLE reporting.contract_expiry_facts
  ADD COLUMN IF NOT EXISTS contract_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_expiry_contract_type_check'
      AND conrelid = 'reporting.contract_expiry_facts'::regclass
  ) THEN
    ALTER TABLE reporting.contract_expiry_facts
      ADD CONSTRAINT contract_expiry_contract_type_check
        CHECK (contract_type IS NULL OR contract_type IN ('PO', 'RC')) NOT VALID;
  END IF;
END $$;

ALTER TABLE reporting.contract_expiry_facts VALIDATE CONSTRAINT contract_expiry_contract_type_check;

CREATE INDEX IF NOT EXISTS cases_contract_type_idx
  ON procurement.cases (tenant_id, contract_type)
  WHERE deleted_at IS NULL AND contract_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS case_facts_contract_type_idx
  ON reporting.case_facts (tenant_id, contract_type)
  WHERE contract_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS contract_expiry_facts_contract_type_idx
  ON reporting.contract_expiry_facts (tenant_id, contract_type)
  WHERE contract_type IS NOT NULL;

UPDATE reporting.case_facts f
SET contract_type = c.contract_type
FROM procurement.cases c
WHERE c.id = f.case_id
  AND c.tenant_id = f.tenant_id
  AND c.contract_type IS NOT NULL;

UPDATE reporting.contract_expiry_facts f
SET contract_type = c.contract_type
FROM procurement.cases c
WHERE c.id = f.case_id
  AND c.tenant_id = f.tenant_id
  AND c.contract_type IS NOT NULL;
