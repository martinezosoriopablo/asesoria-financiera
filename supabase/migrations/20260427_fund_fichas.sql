-- Fund fichas: tax benefits and PDF ficha per fund series
CREATE TABLE fund_fichas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fo_run INTEGER NOT NULL,
  fm_serie TEXT NOT NULL,
  -- Tax benefits
  beneficio_107lir BOOLEAN DEFAULT FALSE,
  beneficio_108lir BOOLEAN DEFAULT FALSE,
  beneficio_apv BOOLEAN DEFAULT FALSE,
  beneficio_57bis BOOLEAN DEFAULT FALSE,
  notas_tributarias TEXT,
  -- PDF ficha
  ficha_pdf_path TEXT,
  ficha_pdf_uploaded_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (fo_run, fm_serie)
);

ALTER TABLE fund_fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated" ON fund_fichas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "write_advisors" ON fund_fichas FOR ALL TO authenticated USING (TRUE);

-- Storage bucket for fund ficha PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('fund-fichas', 'fund-fichas', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can read/write
CREATE POLICY "fund_fichas_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fund-fichas');
CREATE POLICY "fund_fichas_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fund-fichas');
CREATE POLICY "fund_fichas_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fund-fichas');
CREATE POLICY "fund_fichas_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fund-fichas');
