-- Phase 6b: named brand/report theme per agency.
--
-- This is additive to (not a replacement of) the Phase 6a `agencies.pdf_theme`
-- column (professional/minimal/branded structural variants). `report_theme`
-- is a new, separate concept: one of 5 fixed named visual identities
-- (Professional Blue, Purple Gradient, Emerald, Dark, Minimal Black & White)
-- that drives both the generated PDF's palette AND the frontend's accent/
-- chart colors for that agency's users. `pdf_theme` is left untouched and
-- unused going forward rather than dropped, so no existing data is lost or
-- altered.
--
-- NOT YET APPLIED to production -- draft for review only.

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS report_theme VARCHAR(30) DEFAULT 'professional-blue';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_report_theme_check'
  ) THEN
    ALTER TABLE agencies DROP CONSTRAINT agencies_report_theme_check;
  END IF;
END $$;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_report_theme_check
  CHECK (report_theme IN ('professional-blue', 'purple-gradient', 'emerald', 'dark', 'minimal-bw'));

-- Metadata-only, mirrors the existing generated_reports.pdf_theme column
-- added in the Phase 6a migration -- records which named theme a given PDF
-- was generated with. Nullable, never backfilled.
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS report_theme VARCHAR(30);
