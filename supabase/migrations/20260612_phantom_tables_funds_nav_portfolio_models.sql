-- Migration to document phantom tables that exist in Supabase (created manually)
-- but had no migration file. These tables are actively used by API routes.

-- ============================================================
-- 1. funds — generic fund catalog (used by nav-upload, market-stats, funds/search)
-- ============================================================
CREATE TABLE IF NOT EXISTS funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT,
  type TEXT NOT NULL DEFAULT 'external',        -- external, mutual_fund, etf, etc.
  provider TEXT,
  asset_class TEXT NOT NULL DEFAULT 'equity',    -- equity, fixed_income, alternative, cash
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  return_1y NUMERIC,
  return_3y NUMERIC,
  return_5y NUMERIC,
  return_10y NUMERIC,
  return_ytd NUMERIC,
  return_mtd NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funds_symbol ON funds (symbol);
CREATE INDEX IF NOT EXISTS idx_funds_name ON funds (name);
CREATE INDEX IF NOT EXISTS idx_funds_is_active ON funds (is_active);

ALTER TABLE funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read funds" ON funds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access funds" ON funds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. nav_history — daily NAV values per fund (used by upload-nav-history)
-- ============================================================
CREATE TABLE IF NOT EXISTS nav_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  nav NUMERIC NOT NULL,
  source TEXT DEFAULT 'import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (fund_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nav_history_fund_date ON nav_history (fund_id, date);

ALTER TABLE nav_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read nav_history" ON nav_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access nav_history" ON nav_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. portfolio_models — client-specific saved portfolio designs
--    (NOT the same as model_portfolios which is committee-driven)
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  risk_profile_id UUID,
  universe TEXT DEFAULT 'global',
  include_alternatives BOOLEAN DEFAULT false,
  portfolio_amount NUMERIC,
  weights JSONB DEFAULT '{}'::jsonb,
  equity_blocks JSONB DEFAULT '[]'::jsonb,
  fixed_income_blocks JSONB DEFAULT '[]'::jsonb,
  alternative_blocks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_models_client ON portfolio_models (client_id);

ALTER TABLE portfolio_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage portfolio_models" ON portfolio_models
  FOR ALL TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
         OR asesor_id IS NULL
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients
      WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
         OR asesor_id IS NULL
    )
  );

CREATE POLICY "Service role full access portfolio_models" ON portfolio_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);
