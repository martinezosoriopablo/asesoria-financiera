-- Increase precision of return columns to prevent overflow
-- DECIMAL(8,4) only allows 4 integer digits (max 9999.9999)
-- Changing to DECIMAL(12,4) allows 8 integer digits (max 99999999.9999)

-- Increase precision for daily_return and cumulative_return
ALTER TABLE portfolio_snapshots
ALTER COLUMN daily_return TYPE DECIMAL(12, 4),
ALTER COLUMN cumulative_return TYPE DECIMAL(12, 4);

-- Also increase TWR columns for safety
ALTER TABLE portfolio_snapshots
ALTER COLUMN twr_period TYPE DECIMAL(12, 4),
ALTER COLUMN twr_cumulative TYPE DECIMAL(12, 4);

-- Update portfolio_metrics table as well
ALTER TABLE portfolio_metrics
ALTER COLUMN total_return TYPE DECIMAL(12, 4),
ALTER COLUMN annualized_return TYPE DECIMAL(12, 4),
ALTER COLUMN volatility TYPE DECIMAL(12, 4),
ALTER COLUMN max_drawdown TYPE DECIMAL(12, 4),
ALTER COLUMN sharpe_ratio TYPE DECIMAL(12, 4),
ALTER COLUMN sortino_ratio TYPE DECIMAL(12, 4),
ALTER COLUMN benchmark_return TYPE DECIMAL(12, 4),
ALTER COLUMN alpha TYPE DECIMAL(12, 4),
ALTER COLUMN beta TYPE DECIMAL(12, 4);
