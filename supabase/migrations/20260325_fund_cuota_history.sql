CREATE TABLE IF NOT EXISTS fund_cuota_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fondo_id UUID NOT NULL REFERENCES fondos_mutuos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  valor_cuota NUMERIC NOT NULL,
  valor_cuota_orig NUMERIC,  -- for USD funds, value in original currency
  moneda TEXT DEFAULT 'CLP',
  source TEXT NOT NULL DEFAULT 'aafm_direct',  -- aafm_direct, aafm_derived_7d, aafm_derived_30d, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fondo_id, fecha, source)
);

CREATE INDEX idx_fund_cuota_history_fondo_fecha ON fund_cuota_history(fondo_id, fecha DESC);
CREATE INDEX idx_fund_cuota_history_fecha ON fund_cuota_history(fecha);

ALTER TABLE fund_cuota_history ENABLE ROW LEVEL SECURITY;

-- Advisors can read all history
CREATE POLICY "advisor_read_cuota_history" ON fund_cuota_history
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM advisors)
  );
