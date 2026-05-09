-- Migration 000004: Performance indexes for cursor pagination and full-text search
-- Adds deterministic keyset-pagination indexes and a stored tsvector column
-- so full-text search reads a pre-computed column rather than recomputing on every query.

-- ── Keyset cursor pagination indexes ─────────────────────────────────────────
-- The `id` tiebreaker guarantees a stable total order when multiple rows share
-- the same `updated_at` value, enabling correct cursor-based pagination.

CREATE INDEX IF NOT EXISTS cases_cursor_all_idx
  ON procurement.cases (tenant_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cases_cursor_running_idx
  ON procurement.cases (tenant_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'running';

CREATE INDEX IF NOT EXISTS cases_cursor_completed_idx
  ON procurement.cases (tenant_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'completed';

-- ── Stored tsvector column for full-text search ───────────────────────────────
-- Expression GIN indexes recompute the tsvector on every query.
-- A stored column is maintained by a trigger and allows direct GIN index lookup.

ALTER TABLE procurement.cases
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce(pr_id, '') || ' ' ||
        coalesce(pr_scheme_no, '') || ' ' ||
        coalesce(pr_description, '') || ' ' ||
        coalesce(tender_name, '') || ' ' ||
        coalesce(tender_no, '') || ' ' ||
        coalesce(pr_remarks, '') || ' ' ||
        coalesce(tm_remarks, '')
      )
    ) STORED;

-- Drop the old expression-based GIN index now that the stored column exists
DROP INDEX IF EXISTS procurement.cases_search_gin_idx;

CREATE INDEX IF NOT EXISTS cases_search_vector_idx
  ON procurement.cases USING gin (search_vector)
  WHERE deleted_at IS NULL;

-- ── Additional supporting indexes ─────────────────────────────────────────────

-- Award lookups by case are common; add id as tiebreaker for keyset pagination
CREATE INDEX IF NOT EXISTS case_awards_cursor_idx
  ON procurement.case_awards (case_id, created_at DESC, id DESC);

-- Milestones ordered by sequence within a case.
-- Older deployed schemas model milestones as one row per case without sequence_no.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'procurement'
      AND table_name = 'case_milestones'
      AND column_name = 'sequence_no'
  ) THEN
    CREATE INDEX IF NOT EXISTS case_milestones_case_seq_idx
      ON procurement.case_milestones (case_id, sequence_no ASC);
  ELSE
    RAISE NOTICE 'Skipping case_milestones_case_seq_idx because procurement.case_milestones.sequence_no does not exist.';
  END IF;
END $$;
