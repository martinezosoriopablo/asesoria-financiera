-- 20260727_benchmark_mode.sql
-- Modo del toggle de benchmark en RetornosComparados (sub-proyecto B).
-- 'uf_spread' = benchmark UF+2% (config actual); 'market_proxy' = índices por clase.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS benchmark_mode text NOT NULL DEFAULT 'uf_spread';

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_benchmark_mode_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_benchmark_mode_check
  CHECK (benchmark_mode IN ('uf_spread', 'market_proxy'));
