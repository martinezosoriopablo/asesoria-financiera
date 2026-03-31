-- Add baseline flag to portfolio_snapshots
-- Only one snapshot per client can be the baseline (initial portfolio)
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT FALSE;

-- Partial unique index: only one baseline per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_baseline_per_client
  ON portfolio_snapshots (client_id) WHERE is_baseline = TRUE;

-- Auto-set earliest snapshot as baseline for clients that have snapshots but no baseline
UPDATE portfolio_snapshots ps
SET is_baseline = TRUE
WHERE ps.id IN (
  SELECT DISTINCT ON (client_id) id
  FROM portfolio_snapshots
  WHERE source IN ('statement', 'manual', 'excel')
  ORDER BY client_id, snapshot_date ASC
)
AND NOT EXISTS (
  SELECT 1 FROM portfolio_snapshots ps2
  WHERE ps2.client_id = ps.client_id AND ps2.is_baseline = TRUE
);
