-- Add TWR (Time-Weighted Return) and cash flow columns to portfolio_snapshots

-- Cash flow tracking columns
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS deposits DECIMAL(18, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS withdrawals DECIMAL(18, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_cash_flow DECIMAL(18, 2) DEFAULT 0;

-- TWR (Time-Weighted Return) columns
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS twr_period DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS twr_cumulative DECIMAL(10, 4) DEFAULT 0;

-- Add comments
COMMENT ON COLUMN portfolio_snapshots.deposits IS 'Total deposits/contributions for this period (in CLP)';
COMMENT ON COLUMN portfolio_snapshots.withdrawals IS 'Total withdrawals for this period (in CLP)';
COMMENT ON COLUMN portfolio_snapshots.net_cash_flow IS 'Net cash flow (deposits - withdrawals) for this period';
COMMENT ON COLUMN portfolio_snapshots.twr_period IS 'Time-Weighted Return for this period (percentage)';
COMMENT ON COLUMN portfolio_snapshots.twr_cumulative IS 'Cumulative TWR since first snapshot (percentage)';

-- Create index for cash flow queries
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_cash_flows
ON portfolio_snapshots(client_id, snapshot_date)
WHERE net_cash_flow != 0;
