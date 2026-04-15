-- Fondos de Inversión v2: add series support and correct column set
-- Discovery: CMF entity pages return one row per (fondo, serie, fecha), not per (fondo, fecha).
-- Columns returned: Valor Libro, Valor Económico, Patrimonio Neto, Activo Total, N° Aportantes
-- This migration assumes fondos_inversion_precios is still empty from initial bootstrap.

-- 1. Recreate precios table with correct schema
DROP TABLE IF EXISTS fondos_inversion_precios;

CREATE TABLE fondos_inversion_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fondo_id UUID NOT NULL REFERENCES fondos_inversion(id) ON DELETE CASCADE,
  serie TEXT NOT NULL,                      -- e.g. 'A', 'AE', 'D', 'E', 'I'
  fecha DATE NOT NULL,
  moneda TEXT,                              -- '$$' (CLP), 'US$' (USD), etc.
  valor_libro NUMERIC(20, 6) NOT NULL,      -- Primary valuation (contable)
  valor_economico NUMERIC(20, 6),           -- Fair value (may differ for illiquid)
  patrimonio_neto NUMERIC(22, 2),           -- Net assets for this series
  activo_total NUMERIC(22, 2),              -- Total fund assets (same across series)
  n_aportantes INTEGER,
  n_aportantes_institucionales INTEGER,
  agencia TEXT,
  rent_diaria NUMERIC(12, 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fondo_id, serie, fecha)
);

CREATE INDEX idx_fi_precios_fondo_fecha ON fondos_inversion_precios(fondo_id, fecha DESC);
CREATE INDEX idx_fi_precios_fondo_serie ON fondos_inversion_precios(fondo_id, serie);
CREATE INDEX idx_fi_precios_fecha ON fondos_inversion_precios(fecha DESC);

ALTER TABLE fondos_inversion_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fi_precios_read_authenticated" ON fondos_inversion_precios
  FOR SELECT TO authenticated USING (TRUE);

-- 2. Add discovered-series catalog on fondos_inversion (optional denormalized helper)
ALTER TABLE fondos_inversion
  ADD COLUMN IF NOT EXISTS series_detectadas TEXT[];
