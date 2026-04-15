-- Fondos de Inversión (FI) — separate from fondos_mutuos (FM)
-- Covers FIRES (rescatables, daily reporting) and FINRE (no rescatables, typically monthly)
-- Source: CMF entity pages (entidad.php pestania=7)

CREATE TABLE IF NOT EXISTS fondos_inversion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT NOT NULL UNIQUE,               -- CMF RUT (numeric string, e.g. "9212")
  nombre TEXT NOT NULL,
  administradora TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('FIRES', 'FINRE')),
  cmf_row TEXT,                            -- CMF internal row id (needed for entity URL)
  moneda TEXT DEFAULT 'CLP',
  activo BOOLEAN DEFAULT TRUE,
  -- Sync tracking
  ultimo_sync TIMESTAMPTZ,
  ultimo_sync_ok BOOLEAN,
  ultimo_sync_error TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fondos_inversion_tipo ON fondos_inversion(tipo);
CREATE INDEX IF NOT EXISTS idx_fondos_inversion_administradora ON fondos_inversion(administradora);
CREATE INDEX IF NOT EXISTS idx_fondos_inversion_activo ON fondos_inversion(activo) WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS fondos_inversion_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fondo_id UUID NOT NULL REFERENCES fondos_inversion(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  valor_cuota NUMERIC(20, 6) NOT NULL,
  activo_neto NUMERIC(20, 2),              -- Patrimonio neto del fondo
  numero_cuotas NUMERIC(20, 6),
  rent_diaria NUMERIC(12, 6),              -- Calculated at insert time if prev available
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fondo_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_fi_precios_fondo_fecha ON fondos_inversion_precios(fondo_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_fi_precios_fecha ON fondos_inversion_precios(fecha DESC);

-- RLS: advisors (authenticated) can read all, service role writes
ALTER TABLE fondos_inversion ENABLE ROW LEVEL SECURITY;
ALTER TABLE fondos_inversion_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fi_read_authenticated" ON fondos_inversion
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "fi_precios_read_authenticated" ON fondos_inversion_precios
  FOR SELECT TO authenticated USING (TRUE);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION fondos_inversion_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fondos_inversion_updated_at_trigger
  BEFORE UPDATE ON fondos_inversion
  FOR EACH ROW EXECUTE FUNCTION fondos_inversion_updated_at();
