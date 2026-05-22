-- Bond reference data extracted from FINRA lookups
-- Populated automatically during historical sync

CREATE TABLE IF NOT EXISTS bond_catalog (
  cusip TEXT PRIMARY KEY,
  issuer TEXT,
  coupon_rate NUMERIC,         -- annual % (e.g., 8.375)
  maturity_date DATE,
  finra_symbol TEXT,            -- issueSymbolIdentifier from FINRA
  source TEXT DEFAULT 'finra',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: advisors can read (public market data)
ALTER TABLE bond_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read bond catalog"
  ON bond_catalog FOR SELECT
  USING (EXISTS (SELECT 1 FROM advisors WHERE id = auth.uid()));

CREATE POLICY "Service role can insert/update bond catalog"
  ON bond_catalog FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update bond catalog"
  ON bond_catalog FOR UPDATE USING (true) WITH CHECK (true);
