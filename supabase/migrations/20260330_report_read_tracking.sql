-- Track which reports the client has viewed
ALTER TABLE client_reports ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
