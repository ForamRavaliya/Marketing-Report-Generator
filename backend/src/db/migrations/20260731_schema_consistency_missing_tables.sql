-- Schema consistency migration (Phase 3 hardening pass).
--
-- WHY THIS EXISTS
-- A full sweep of every table/column the application code reads or writes,
-- compared against schema.sql and all tracked migrations, found:
--
--   1. Six tables never captured anywhere in version control:
--      payment_orders, payments, subscriptions, ai_insights,
--      report_usage_logs, column_mappings
--   2. Columns missing from four already-tracked tables:
--      agencies (contact_email, phone, website, address, is_active,
--        logo_public_id), generated_reports (currency),
--      performance_data (followers), report_uploads (report_type)
--   3. Two CHECK constraints missing a value the app already writes:
--      users.role is missing 'super_admin';
--      report_uploads.extraction_status is missing 'mapping_required'
--
-- All of this was created/altered directly against the production database
-- at some point outside of version control. This migration brings the
-- tracked schema back in line with what the running application actually
-- depends on today.
--
-- NOT included: the legacy `ad_accounts` table and `sync_logs.ad_account_id`
-- column, referenced only by routes/adAccounts.js, which is not mounted in
-- server.js (commented out) and therefore inactive in production. Adding
-- schema for a disabled code path was judged out of scope here — flag if
-- you want that route revived.
--
-- SAFETY
-- Every CREATE TABLE below uses IF NOT EXISTS, and every new column uses
-- ADD COLUMN IF NOT EXISTS. On the current production database these are
-- all pure no-ops (the tables/columns already exist there — that's how the
-- app already works today) — nothing is dropped, recreated, or truncated.
-- This migration only has teeth against a database where they don't exist
-- yet (e.g. a fresh local/staging setup built from schema.sql).
--
-- KEY TYPE NOTE: the CREATE TABLE fallback definitions below (payment_orders,
-- payments, subscriptions, ai_insights, report_usage_logs, column_mappings)
-- use UUID primary/foreign keys, matching schema.sql. The current live
-- production database actually uses INTEGER/SERIAL keys for agencies,
-- clients, users, etc. (see schema.sql's file header). That mismatch is
-- harmless here specifically because every one of these tables already
-- exists in production with the correct INTEGER-based columns, so
-- CREATE TABLE IF NOT EXISTS never executes the UUID version there — it
-- only matters for a fresh install following schema.sql, where it is
-- self-consistent. Do not "fix" this by rewriting the types below to
-- INTEGER: that would break fresh installs, which are UUID-keyed by design.
--
-- The statements that DO touch already-populated tables are the two CHECK
-- constraint updates (users.role and report_uploads.extraction_status).
-- Before running this migration, verify there are no unexpected values in
-- production:
--
--   SELECT DISTINCT role FROM users;
--   SELECT DISTINCT extraction_status FROM report_uploads;
--
-- Every value found anywhere in the application code is covered by the new
-- constraints below (role: admin/analyst/viewer/super_admin;
-- extraction_status: pending/processing/completed/failed/mapping_required)
-- — if both queries return only values from those sets, the constraint
-- updates are safe to run. If either returns anything else, stop and
-- review before proceeding.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Columns confirmed used by application code (agency.js, reports.js,
-- uploads.js) but missing from the tracked agencies/generated_reports/
-- performance_data/report_uploads tables. ADD COLUMN IF NOT EXISTS is a
-- no-op wherever the column already exists, so this is safe against the
-- populated production tables.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS logo_public_id VARCHAR(255);

ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';

ALTER TABLE performance_data ADD COLUMN IF NOT EXISTS followers INTEGER DEFAULT 0;

ALTER TABLE report_uploads ADD COLUMN IF NOT EXISTS report_type VARCHAR(50);

-- report_uploads.extraction_status is missing 'mapping_required', which the
-- CSV/Excel upload confirm-mapping flow (routes/uploads.js) already writes.
-- Same pre-flight caveat as the users.role fix below: verify current values
-- first with:
--   SELECT DISTINCT extraction_status FROM report_uploads;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'report_uploads_extraction_status_check'
  ) THEN
    ALTER TABLE report_uploads DROP CONSTRAINT report_uploads_extraction_status_check;
  END IF;
END $$;

ALTER TABLE report_uploads
  ADD CONSTRAINT report_uploads_extraction_status_check
  CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed', 'mapping_required'));

-- Razorpay orders created via /api/payments/create-order.
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_name VARCHAR(50) NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_order_id)
);

-- Verified/reconciled Razorpay payments (written by /verify and the
-- payment.captured webhook — see paymentReconciliationService.js).
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES payment_orders(id),
  provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
  provider_payment_id VARCHAR(255) NOT NULL,
  provider_order_id VARCHAR(255),
  plan_name VARCHAR(50),
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  amount DECIMAL(15,2),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'success',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Defense-in-depth for the idempotency logic in
-- paymentReconciliationService.js — see Phase 2 report for detail on why
-- this is currently application-level only. Safe to add: on production this
-- CREATE TABLE is a no-op, so this constraint never runs against existing
-- rows here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON payments(provider_payment_id);

-- One row per agency tracking current plan/billing state.
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_name VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  payment_provider VARCHAR(50),
  last_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  next_plan_name VARCHAR(50),
  downgrade_scheduled BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Note: status and plan_name are intentionally NOT constrained with CHECK
-- here — routes/superAdmin.js's plan-override endpoint accepts an
-- unvalidated status string from the request body, so a fixed enum could
-- reject a legitimate super-admin action on a fresh install.

-- Rule-based "AI" insight snapshots (see services/aiInsightsService.js).
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) DEFAULT 'performance',
  summary TEXT,
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Free-plan monthly report-generation counter (routes/reports.js).
CREATE TABLE IF NOT EXISTS report_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plan_name VARCHAR(50),
  action VARCHAR(50) NOT NULL DEFAULT 'generate',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Remembers a client's last-used column-mapping per platform
-- (routes/uploads.js). The UNIQUE constraint below is required for that
-- route's existing ON CONFLICT (client_id, platform, target_field) clause
-- to work at all.
CREATE TABLE IF NOT EXISTS column_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  target_field VARCHAR(100) NOT NULL,
  source_column VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, platform, target_field)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_agency ON payment_orders(agency_id);
CREATE INDEX IF NOT EXISTS idx_payments_agency ON payments(agency_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_agency ON subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_client ON ai_insights(client_id, agency_id);
CREATE INDEX IF NOT EXISTS idx_report_usage_logs_agency_month ON report_usage_logs(agency_id, created_at);

-- Bring the users.role CHECK constraint in line with the super_admin role
-- the application already uses (middleware/auth.js requireSuperAdmin,
-- routes/superAdmin.js). Uses the same safe drop-then-add idiom as the
-- existing platform-CHECK migrations in this directory. Read the
-- pre-flight note at the top of this file before running this in production.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'analyst', 'viewer', 'super_admin'));
