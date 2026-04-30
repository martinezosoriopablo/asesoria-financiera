-- Fichas for Fondos de Inversión (same structure as fund_fichas but keyed by fi_rut)
CREATE TABLE fi_fichas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fi_rut TEXT NOT NULL,
  fi_serie TEXT NOT NULL,
  -- Tax benefits
  beneficio_107lir BOOLEAN DEFAULT FALSE,
  beneficio_108lir BOOLEAN DEFAULT FALSE,
  beneficio_apv BOOLEAN DEFAULT FALSE,
  beneficio_57bis BOOLEAN DEFAULT FALSE,
  notas_tributarias TEXT,
  -- Extracted PDF data
  tac_serie NUMERIC,
  nombre_fondo_pdf TEXT,
  serie_detectada TEXT,
  rent_1m NUMERIC,
  rent_3m NUMERIC,
  rent_6m NUMERIC,
  rent_12m NUMERIC,
  rescatable BOOLEAN,
  plazo_rescate TEXT,
  horizonte_inversion TEXT,
  tolerancia_riesgo TEXT,
  objetivo TEXT,
  -- PDF ficha
  ficha_pdf_path TEXT,
  ficha_pdf_uploaded_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (fi_rut, fi_serie)
);

ALTER TABLE fi_fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated" ON fi_fichas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "write_advisors" ON fi_fichas FOR ALL TO authenticated USING (TRUE);
