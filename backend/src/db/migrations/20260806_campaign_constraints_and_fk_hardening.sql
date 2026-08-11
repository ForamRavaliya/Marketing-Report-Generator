-- Phase 3 bucket B: fixes confirmed safe by read-only pre-flight checks
-- against production (see conversation record / audit report for exact
-- queries and results run on 2026-08-06). Every check below came back
-- clean (0 duplicates, 0 unexpected NULLs) before this file was written.
--
-- NOT YET APPLIED to production -- draft for review only. Do not run
-- until explicitly approved.

-- 1. campaigns has no UNIQUE(client_id, name, platform), but
--    services/sync/syncRunner.js's upsertCampaign() already does
--    INSERT ... ON CONFLICT (client_id, name, platform) DO UPDATE ...
--    which requires a matching unique constraint to exist at all --
--    without it, Postgres raises 42P10 the first time this runs (i.e.
--    the moment ENABLE_PLATFORM_SYNC is turned on). Pre-flight check
--    confirmed 0 existing duplicate (client_id, name, platform) rows
--    across all 181 current campaigns, so this is safe to add now.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_client_name_platform_key'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_client_name_platform_key UNIQUE (client_id, name, platform);
  END IF;
END $$;

-- 2. utils/platformType.js's detectPlatform() can return 'woocommerce',
--    'amazon', or 'ga4', none of which are in campaigns_platform_check.
--    Masked today because the frontend always sends an explicit platform,
--    but a direct API call omitting `platform` on one of those file types
--    would roll back the entire upload transaction. Pre-flight check
--    confirmed only meta/other/twitter/linkedin/google exist in production
--    today, so widening (never narrowing) this CHECK touches zero rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_platform_check'
  ) THEN
    ALTER TABLE campaigns DROP CONSTRAINT campaigns_platform_check;
  END IF;
END $$;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_platform_check
  CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'linkedin_ads',
                       'twitter', 'tiktok', 'shopify', 'woocommerce', 'amazon', 'ga4', 'other'));

-- 3. Tenant/parent FK columns that every code path already always
--    populates, but which schema.sql never marked NOT NULL -- meaning a
--    future bug (bad script, ORM misuse) could silently insert a NULL
--    and have that row silently vanish from agency_id/client_id-filtered
--    dashboard and report queries instead of failing loudly. Pre-flight
--    check confirmed 0 existing NULLs on every column below.
ALTER TABLE users ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE report_uploads ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE report_uploads ALTER COLUMN uploaded_by SET NOT NULL;
ALTER TABLE performance_data ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE generated_reports ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE generated_reports ALTER COLUMN agency_id SET NOT NULL;
