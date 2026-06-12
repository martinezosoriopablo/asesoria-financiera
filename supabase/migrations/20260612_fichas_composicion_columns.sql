-- Add composition columns to fichas tables
-- Extracted by Gemini from CMF fund fact sheets

ALTER TABLE fund_fichas
  ADD COLUMN IF NOT EXISTS pct_uf NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_renta_variable NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_renta_fija NUMERIC;

ALTER TABLE fi_fichas
  ADD COLUMN IF NOT EXISTS pct_uf NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_renta_variable NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_renta_fija NUMERIC;
