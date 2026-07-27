CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'twitter', 'tiktok', 'shopify', 'other')),
  account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(500),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'failed', 'disconnected')),
  sync_frequency VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (sync_frequency IN ('manual', 'daily', 'hourly')),
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_id, client_id, platform, account_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES platform_connections(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL,
  sync_type VARCHAR(50) NOT NULL,
  date_from DATE,
  date_to DATE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  rows_fetched INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  warnings JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES platform_connections(id) ON DELETE SET NULL;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS sync_type VARCHAR(50);
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS date_from DATE;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS date_to DATE;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS rows_fetched INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS rows_imported INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS warnings JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS integration_id UUID;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS mode VARCHAR(50);
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS rows_synced INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS synced_campaigns INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE performance_data ADD COLUMN IF NOT EXISTS external_campaign_name VARCHAR(500);
ALTER TABLE performance_data ADD COLUMN IF NOT EXISTS report_type VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_unique_external_campaign
  ON performance_data(client_id, platform, external_campaign_name, report_month);

CREATE INDEX IF NOT EXISTS idx_platform_connections_agency ON platform_connections(agency_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_client ON platform_connections(client_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform ON platform_connections(platform);
CREATE INDEX IF NOT EXISTS idx_platform_connections_status ON platform_connections(status);
CREATE INDEX IF NOT EXISTS idx_platform_connections_last_sync ON platform_connections(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_agency ON sync_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_client ON sync_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection ON sync_logs(connection_id);

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
