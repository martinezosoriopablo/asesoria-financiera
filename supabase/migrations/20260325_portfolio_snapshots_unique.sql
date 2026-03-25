CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshots_client_date
ON portfolio_snapshots(client_id, snapshot_date);

-- Also add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_client_date_desc
ON portfolio_snapshots(client_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_client_source
ON portfolio_snapshots(client_id, source);

CREATE INDEX IF NOT EXISTS idx_client_cartolas_client_date
ON client_cartolas(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_profiles_client_created
ON risk_profiles(client_id, created_at DESC);
