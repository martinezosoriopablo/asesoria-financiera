-- Agrega el deducible (con su moneda) a los seguros — relevante sobre todo en salud.
-- Idempotente. Aplicar a mano en Supabase.
ALTER TABLE client_seguros
  ADD COLUMN IF NOT EXISTS deducible_monto  numeric,
  ADD COLUMN IF NOT EXISTS deducible_moneda text CHECK (deducible_moneda IN ('CLP','UF','USD'));
