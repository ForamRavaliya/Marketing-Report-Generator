-- Performance Marketing Report Generator Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agencies (white-label)
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#2563EB',
  secondary_color VARCHAR(7) DEFAULT '#1E40AF',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'viewer')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  website VARCHAR(255),
  contact_email VARCHAR(255),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'linkedin_ads', 'twitter', 'tiktok', 'shopify', 'other')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended', 'draft')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Report uploads (raw files)
CREATE TABLE IF NOT EXISTS report_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('pdf', 'csv', 'excel', 'image', 'json')),
  file_path TEXT NOT NULL,
  file_size INTEGER,
  extraction_status VARCHAR(50) DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_error TEXT,
  platform VARCHAR(50),
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance data (extracted metrics)
CREATE TABLE IF NOT EXISTS performance_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  upload_id UUID REFERENCES report_uploads(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  report_month DATE NOT NULL, -- First day of the month for monthly aggregation
  date_range_start DATE,
  date_range_end DATE,
  
  -- Core metrics
  spend DECIMAL(15,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(8,4) DEFAULT 0,       -- Click-through rate %
  cpc DECIMAL(10,4) DEFAULT 0,       -- Cost per click
  conversions INTEGER DEFAULT 0,
  cpa DECIMAL(10,4) DEFAULT 0,       -- Cost per acquisition
  roas DECIMAL(10,4) DEFAULT 0,      -- Return on ad spend
  revenue DECIMAL(15,2) DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency DECIMAL(8,4) DEFAULT 0,
  
  -- Social metrics
  likes INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  engagement_rate DECIMAL(8,4) DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  
  -- Raw extracted data (JSON)
  raw_data JSONB,
  
  is_duplicate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent exact duplicates
  UNIQUE(client_id, platform, report_month, campaign_id)
);

-- Generated reports
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  report_type VARCHAR(50) DEFAULT 'monthly' CHECK (report_type IN ('monthly', 'quarterly', 'custom', 'comparison')),
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  platforms TEXT[] DEFAULT '{}',
  file_path TEXT,
  share_token UUID DEFAULT uuid_generate_v4(),
  is_shared BOOLEAN DEFAULT FALSE,
  custom_branding JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  recipient_email VARCHAR(255),
  cc_email VARCHAR(255),
  send_day INTEGER DEFAULT 1 CHECK (send_day BETWEEN 1 AND 28),
  last_sent_month VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, agency_id)
);

CREATE TABLE IF NOT EXISTS email_report_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES users(id),
  recipient_email VARCHAR(255),
  cc_email VARCHAR(255),
  report_month VARCHAR(7),
  subject TEXT,
  status VARCHAR(50) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_email_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'google',
  email VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_performance_client_month ON performance_data(client_id, report_month);
CREATE INDEX IF NOT EXISTS idx_performance_platform ON performance_data(platform);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_uploads_client ON report_uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_due ON client_email_settings(agency_id, enabled, send_day, last_sent_month);
CREATE INDEX IF NOT EXISTS idx_email_logs_client_month ON email_report_logs(client_id, agency_id, report_month);
CREATE INDEX IF NOT EXISTS idx_user_email_connections_user ON user_email_connections(user_id, provider);

-- Auto Sync platform connections
CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('meta', 'google', 'google_ads', 'linkedin', 'linkedin_ads', 'twitter', 'tiktok', 'shopify', 'other')),
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

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS external_campaign_name VARCHAR(500);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS report_type VARCHAR(50);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS row_level VARCHAR(50);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(100);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_value NUMERIC DEFAULT 0;

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_breakdown JSONB DEFAULT '{}'::jsonb;

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

-- Sample agency
INSERT INTO agencies (id, name, primary_color, secondary_color) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Agency', '#2563EB', '#7C3AED')
ON CONFLICT DO NOTHING;

-- Sample admin user
-- Password is: admin123
-- Hash generated with: bcrypt.hash('admin123', 10)
-- To regenerate: node -e "require('bcryptjs').hash('admin123',10).then(console.log)"
INSERT INTO users (agency_id, email, password_hash, full_name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@demo.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Admin User',
  'admin'
) ON CONFLICT DO NOTHING;
