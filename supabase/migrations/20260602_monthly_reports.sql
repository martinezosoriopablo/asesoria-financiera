-- Monthly market reports (HTML) uploaded by advisors
CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,          -- '2026-05' format
  title TEXT,                          -- e.g. 'Reporte Mensual MAYO 2026'
  html_content TEXT NOT NULL,
  uploaded_by UUID REFERENCES advisors(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_month ON monthly_reports(month DESC);

ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read monthly_reports"
  ON monthly_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage monthly_reports"
  ON monthly_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
