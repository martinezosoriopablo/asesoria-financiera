-- 1. Extend advisor_preferred_funds with international instrument support
ALTER TABLE advisor_preferred_funds
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS instrument_type TEXT DEFAULT 'fund'
    CHECK (instrument_type IN ('fund', 'etf', 'stock', 'bond')),
  ADD COLUMN IF NOT EXISTS expense_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS custodian_type TEXT DEFAULT 'agf'
    CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));

-- 2. Custodian configuration table
CREATE TABLE IF NOT EXISTS custodian_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('agf', 'corredora', 'internacional')),
  commission_pct NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (advisor_id, name)
);

ALTER TABLE custodian_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors manage own custodians"
  ON custodian_config FOR ALL
  TO authenticated
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

CREATE POLICY "Service role full access custodian_config"
  ON custodian_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Category-to-fund mapping table
CREATE TABLE IF NOT EXISTS model_fund_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  categoria TEXT NOT NULL,
  custodian_type TEXT NOT NULL CHECK (custodian_type IN ('agf', 'corredora', 'internacional')),
  preferred_fund_id UUID NOT NULL REFERENCES advisor_preferred_funds(id),

  UNIQUE (advisor_id, categoria, custodian_type)
);

ALTER TABLE model_fund_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors manage own mappings"
  ON model_fund_mapping FOR ALL
  TO authenticated
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

CREATE POLICY "Service role full access model_fund_mapping"
  ON model_fund_mapping FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
