-- Dynamic plan pricing: subscription_plans is the mutable, super-admin-
-- editable source of truth for monthly/yearly plan prices. config/pricing.js
-- (PLAN_PRICING) remains only as a safe fallback for when this table is
-- unavailable -- it is never written to at runtime.
--
-- Deliberately unrelated to the pre-existing, code-disconnected
-- `pricing_plans` table already present in this database (different name,
-- different shape, stale values, no migration or code ever referenced it).
-- That table is left untouched -- flagged as a manual cleanup item, not
-- touched by this migration.
--
-- Additive, idempotent, safe to run multiple times: CREATE TABLE IF NOT
-- EXISTS + INSERT ... ON CONFLICT DO NOTHING. Never rewrites an existing
-- row, so a price already edited by Super Admin is never clobbered by a
-- re-run of this migration.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  plan_key VARCHAR(20) NOT NULL UNIQUE
    CHECK (plan_key IN ('free', 'pro', 'agency')),
  display_name VARCHAR(50) NOT NULL,
  monthly_price INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  yearly_price INTEGER NOT NULL DEFAULT 0 CHECK (yearly_price >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Seed from the current canonical pricing source (backend/src/config/
-- pricing.js), verified against live payment_orders / payments rows before
-- writing this migration. NOT copied from the orphan pricing_plans table,
-- whose values (pro 499/4490, agency yearly 22500) do not match real
-- pricing. ON CONFLICT DO NOTHING keeps this re-runnable without ever
-- overwriting a price Super Admin has since changed.
INSERT INTO subscription_plans
  (plan_key, display_name, monthly_price, yearly_price, currency, is_active, sort_order)
VALUES
  ('free',   'Free',   0,   0,     'INR', true, 0),
  ('pro',    'Pro',    999, 9990,  'INR', true, 1),
  ('agency', 'Agency', 2500, 25000, 'INR', true, 2)
ON CONFLICT (plan_key) DO NOTHING;
