-- Daily market reports uploaded by advisor (HTML + podcast MP3)
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('am', 'pm')),
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  podcast_url TEXT,
  distributed BOOLEAN DEFAULT FALSE,
  distributed_at TIMESTAMPTZ,
  recipients_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_daily_report_date_period UNIQUE (report_date, period)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date
  ON daily_reports(report_date DESC);

-- Add daily report toggle to client report config
ALTER TABLE client_report_config
  ADD COLUMN IF NOT EXISTS send_daily_report BOOLEAN DEFAULT FALSE;
