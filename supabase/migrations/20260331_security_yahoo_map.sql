-- Maps security identifiers (CUSIP, ISIN) to Yahoo Finance tickers
-- Used by fill-prices to resolve international mutual fund prices
CREATE TABLE IF NOT EXISTS security_yahoo_map (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  security_id TEXT NOT NULL,           -- CUSIP or ISIN from the statement (e.g. G54420248, L57812882)
  yahoo_ticker TEXT NOT NULL,          -- Yahoo Finance ticker (e.g. 0P000019AY)
  fund_name TEXT,                      -- Human-readable name for reference
  currency TEXT DEFAULT 'USD',         -- Price currency
  verified BOOLEAN DEFAULT FALSE,      -- Whether price was verified against statement
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_security_yahoo_map UNIQUE (security_id)
);

-- Seed with known mappings from Banchile/Pershing statements
INSERT INTO security_yahoo_map (security_id, yahoo_ticker, fund_name, currency, verified) VALUES
  ('G54420248', '0P000093LM', 'FTGF Western Asset US Core Plus Bond Fund Class A ACC USD', 'USD', true),
  ('G9519Z621', '0P0001BV91', 'Wellington Opportunistic Fixed Income Fund Class D UNHDG ACC USD', 'USD', true),
  ('L5447Q521', '0P0000NRIL', 'Ninety One GSF Latin American Equity Fund Class A ACC USD', 'USD', true),
  ('L54483638', '0P0000SVT9', 'Ninety One GSF Emerging Markets Corporate Debt Fund Class A ACC USD', 'USD', true),
  ('L57812882', '0P000019AY', 'JPMorgan US Value Fund Class A ACC USD', 'USD', true),
  ('L57819580', '0P00000DTX', 'JPMorgan US Select Equity Fund Class A ACC USD', 'USD', true),
  ('L57826114', '0P000019CG', 'JPMorgan US Aggregate Bond Fund Class A ACC USD', 'USD', true),
  ('L7S83N267', '0P00014ZMB', 'Robeco Global Credits Fund Class DH USD', 'USD', true),
  ('L8146A680', '0P00000APH', 'Schroder ISF Asian Opportunities Fund Class A ACC USD', 'USD', true)
ON CONFLICT (security_id) DO UPDATE SET
  yahoo_ticker = EXCLUDED.yahoo_ticker,
  fund_name = EXCLUDED.fund_name,
  verified = EXCLUDED.verified,
  updated_at = NOW();
