-- Client monthly closing reports (AI-generated, editable)
CREATE TABLE IF NOT EXISTS client_monthly_closings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                 -- '2026-05'
  content TEXT NOT NULL,               -- markdown content
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'final'
  monthly_report_id UUID REFERENCES monthly_reports(id),
  advisor_id UUID REFERENCES advisors(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, month)
);

CREATE INDEX IF NOT EXISTS idx_client_closings_client_month
  ON client_monthly_closings(client_id, month DESC);

ALTER TABLE client_monthly_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read own client closings"
  ON client_monthly_closings FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));

CREATE POLICY "Service role can manage closings"
  ON client_monthly_closings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
