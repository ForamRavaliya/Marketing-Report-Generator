DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaigns_platform_check'
  ) THEN
    ALTER TABLE campaigns DROP CONSTRAINT campaigns_platform_check;
  END IF;
END $$;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_platform_check
  CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'twitter', 'tiktok', 'other'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_connections_platform_check'
  ) THEN
    ALTER TABLE platform_connections DROP CONSTRAINT platform_connections_platform_check;
  END IF;
END $$;

ALTER TABLE platform_connections
  ADD CONSTRAINT platform_connections_platform_check
  CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'twitter', 'tiktok', 'shopify', 'other'));
