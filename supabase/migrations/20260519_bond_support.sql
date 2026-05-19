-- supabase/migrations/20260519_bond_support.sql
-- Bond portfolio support: per-client bond overrides for editable fields

-- Table for advisor-editable bond data, keyed by client + CUSIP.
-- Bond metadata from the cartola (coupon, maturity, rating) lives in
-- snapshot_holdings JSONB. This table stores only the fields the advisor
-- can override: purchase_date, coupon_frequency, issuer.
CREATE TABLE IF NOT EXISTS bond_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cusip TEXT NOT NULL,
  purchase_date DATE,
  coupon_frequency TEXT NOT NULL DEFAULT 'semiannual'
    CHECK (coupon_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  issuer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cusip)
);

-- RLS: same as clients table — advisor can access own clients
ALTER TABLE bond_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage bond_overrides for their clients"
  ON bond_overrides
  FOR ALL
  USING (
    client_id IN (SELECT get_accessible_client_ids())
  )
  WITH CHECK (
    client_id IN (SELECT get_accessible_client_ids())
  );

-- Index for lookups
CREATE INDEX idx_bond_overrides_client ON bond_overrides(client_id);
