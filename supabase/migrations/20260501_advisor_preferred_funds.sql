-- Advisor preferred funds list
CREATE TABLE IF NOT EXISTS advisor_preferred_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  fund_run TEXT NOT NULL,         -- RUN del fondo en CMF (e.g., "1234-1")
  fund_name TEXT,
  category TEXT,                  -- e.g., "Renta Variable Nacional"
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(advisor_id, fund_run)
);

-- Fund selection mode per client
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS fund_selection_mode TEXT
  DEFAULT 'all_funds'
  CHECK (fund_selection_mode IN ('only_my_list', 'my_list_with_fallback', 'all_funds'));

-- RLS
ALTER TABLE advisor_preferred_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_crud_preferred_funds"
  ON advisor_preferred_funds FOR ALL
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

COMMENT ON TABLE advisor_preferred_funds
  IS 'Personal fund list per advisor. Used in AI recommendations.';
COMMENT ON COLUMN clients.fund_selection_mode
  IS 'Fund universe for this client: only_my_list, my_list_with_fallback, or all_funds';
