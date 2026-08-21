-- supabase/migrations/20260820_fees_model.sql
-- Fase 2 v2.0: modelo de cobro (fees) con defaults del asesor + por cliente.
-- Todas las columnas nullable (null = "no configurado"). El CHECK permite NULL.

ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS default_cobro_tipo TEXT
    CHECK (default_cobro_tipo IN ('agf', 'corredora', 'mixto')),
  ADD COLUMN IF NOT EXISTS default_rebate_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS default_advisory_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS default_comision_transaccion_pct NUMERIC;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cobro_tipo TEXT
    CHECK (cobro_tipo IN ('agf', 'corredora', 'mixto')),
  ADD COLUMN IF NOT EXISTS rebate_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS advisory_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS comision_transaccion_pct NUMERIC;
