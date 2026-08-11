-- Phase 6: persistent theme preferences.
-- users.ui_theme        -- user-level app appearance (system/light/dark)
-- agencies.pdf_theme    -- agency-level report presentation (professional/minimal/branded)
-- generated_reports.pdf_theme -- metadata only, records which variant a given
--                                 PDF was generated with; nullable, never backfilled
--
-- All additive, idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / safe
-- drop-then-recreate for CHECK constraints, matching the existing migrations'
-- style). Existing rows read the column DEFAULT with no backfill required.
-- Backend code additionally coalesces NULL/invalid values in application
-- logic, so this is safe even before/without being applied here.
--
-- NOT YET APPLIED to production -- draft for review only.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_theme VARCHAR(10) DEFAULT 'system';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_ui_theme_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_ui_theme_check;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_ui_theme_check
  CHECK (ui_theme IN ('system', 'light', 'dark'));

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS pdf_theme VARCHAR(20) DEFAULT 'professional';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_pdf_theme_check'
  ) THEN
    ALTER TABLE agencies DROP CONSTRAINT agencies_pdf_theme_check;
  END IF;
END $$;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_pdf_theme_check
  CHECK (pdf_theme IN ('professional', 'minimal', 'branded'));

-- Metadata-only: which PDF theme a specific generated report used. Nullable
-- so existing rows (generated before this column existed) simply show NULL
-- -- no retroactive change to the report itself or its stored file.
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS pdf_theme VARCHAR(20);
