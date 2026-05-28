-- International prices table (AlphaVantage/Yahoo/FINRA data)
CREATE TABLE IF NOT EXISTS international_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date DATE NOT NULL,
  close_price NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,  -- 'alphavantage' | 'yahoo' | 'finra'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, price_date)
);

CREATE INDEX IF NOT EXISTS idx_intl_prices_symbol_date
  ON international_prices(symbol, price_date DESC);

-- Benchmark config per client (advisor-configured)
-- Example: [{"ticker":"ACWI","weight":0.8},{"ticker":"AGG","weight":0.2}]
-- Example: [{"ticker":"UF","weight":1.0,"spread":2.0}]
ALTER TABLE clients ADD COLUMN IF NOT EXISTS benchmark_config JSONB;

-- RLS: shared price data, read by any authenticated user, write by service role
ALTER TABLE international_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read international_prices"
  ON international_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert international_prices"
  ON international_prices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update international_prices"
  ON international_prices FOR UPDATE
  TO service_role
  USING (true);
