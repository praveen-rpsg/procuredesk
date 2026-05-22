-- Fix tentative_tendering_date fallback in contract_expiry_facts.
-- Previously defaulted to rc_po_award_date + 150 (days after award).
-- Correct default is rc_po_validity_date - 150 (days before contract expiry).
-- Only rows where the source record has no explicit tentative_tendering_date are updated.

update reporting.contract_expiry_facts f
set tentative_tendering_date = p.rc_po_validity_date - 150
from procurement.rc_po_plans p
where f.rc_po_plan_id = p.id
  and p.tentative_tendering_date is null
  and p.rc_po_validity_date is not null;

update reporting.contract_expiry_facts f
set tentative_tendering_date = a.po_validity_date - 150
from procurement.case_awards a
where f.case_award_id = a.id
  and a.tentative_tendering_date is null
  and a.po_validity_date is not null;
