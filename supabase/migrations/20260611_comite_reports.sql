-- Tabla para reportes del comité (HTML uploads: macro, rv, rf, asset_allocation, custom)
CREATE TABLE IF NOT EXISTS comite_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  report_date DATE,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE comite_reports ENABLE ROW LEVEL SECURITY;

-- Solo advisors autenticados pueden leer
CREATE POLICY "advisors_read_comite_reports" ON comite_reports
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM advisors)
  );

-- Solo advisors autenticados pueden insertar/actualizar
CREATE POLICY "advisors_write_comite_reports" ON comite_reports
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM advisors)
  );
