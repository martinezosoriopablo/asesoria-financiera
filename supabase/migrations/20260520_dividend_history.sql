-- supabase/migrations/20260520_dividend_history.sql
-- Store dividend events fetched from Alpha Vantage (public market data)

CREATE TABLE IF NOT EXISTS dividend_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  ex_dividend_date DATE NOT NULL,
  payment_date DATE,
  amount NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'alphavantage',
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, ex_dividend_date, source)
);

-- RLS: advisors can read (public market data, same pattern as bond_prices)
ALTER TABLE dividend_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read dividend history"
  ON dividend_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM advisors WHERE id = auth.uid())
  );

CREATE POLICY "Service role can insert dividend history"
  ON dividend_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update dividend history"
  ON dividend_history FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_dividend_history_ticker_date
  ON dividend_history(ticker, ex_dividend_date DESC);
