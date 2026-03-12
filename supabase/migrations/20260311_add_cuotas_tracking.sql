-- Add cuotas (units/shares) tracking to portfolio_snapshots

-- Total cuotas across all holdings
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS total_cuotas DECIMAL(18, 6) DEFAULT 0;

-- Change in cuotas from previous snapshot (positive = bought, negative = sold)
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS cuotas_change DECIMAL(18, 6) DEFAULT 0;

-- Add comments
COMMENT ON COLUMN portfolio_snapshots.total_cuotas IS 'Total number of units/shares across all holdings';
COMMENT ON COLUMN portfolio_snapshots.cuotas_change IS 'Change in cuotas from previous snapshot (+ bought, - sold)';
