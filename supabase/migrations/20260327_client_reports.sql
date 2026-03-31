-- Client report configuration: what reports each client receives and how often
CREATE TABLE IF NOT EXISTS client_report_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'none' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'none')),
  send_portfolio_report BOOLEAN DEFAULT TRUE,
  send_macro BOOLEAN DEFAULT FALSE,
  send_rv BOOLEAN DEFAULT FALSE,
  send_rf BOOLEAN DEFAULT FALSE,
  send_asset_allocation BOOLEAN DEFAULT FALSE,
  last_sent_at TIMESTAMPTZ,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_report_config_client UNIQUE (client_id)
);

-- Client reports: history of all reports sent
CREATE TABLE IF NOT EXISTS client_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'portfolio_update',
  snapshot_summary JSONB,
  market_commentary TEXT,
  comite_reports_included JSONB DEFAULT '[]',
  sent_via TEXT DEFAULT 'portal' CHECK (sent_via IN ('portal', 'email', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reports_client_date
  ON client_reports(client_id, report_date DESC);
