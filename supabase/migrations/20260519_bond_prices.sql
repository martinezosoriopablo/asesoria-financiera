-- supabase/migrations/20260519_bond_prices.sql
-- Store bond prices scraped from FINRA TRACE portal

CREATE TABLE IF NOT EXISTS bond_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cusip TEXT NOT NULL,
  isin TEXT,
  issuer TEXT,
  price_date DATE NOT NULL,
  last_price NUMERIC,
  yield_to_maturity NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL DEFAULT 'finra',
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cusip, price_date, source)
);

-- RLS: advisors can read all bond prices (public market data)
ALTER TABLE bond_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read bond prices"
  ON bond_prices FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM advisors WHERE id = auth.uid())
  );

-- Service role inserts (from API route with createAdminClient)
CREATE POLICY "Service role can insert bond prices"
  ON bond_prices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update bond prices"
  ON bond_prices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_bond_prices_cusip_date ON bond_prices(cusip, price_date DESC);
CREATE INDEX idx_bond_prices_date ON bond_prices(price_date DESC);
