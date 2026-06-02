-- Stock profiles cache (sector, industry from AlphaVantage OVERVIEW)
CREATE TABLE IF NOT EXISTS stock_profiles (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,
  country TEXT,
  exchange TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — reference data, not client-specific
