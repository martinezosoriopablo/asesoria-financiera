-- Rebalance execution tracking
-- Records actual trades executed after a recommendation is made

CREATE TABLE rebalance_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  recommendation_version_id UUID REFERENCES recommendation_versions(id),
  -- Trade details
  ticker TEXT NOT NULL,
  nombre TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'hold')),
  target_percent NUMERIC, -- recommended %
  actual_percent NUMERIC, -- % before trade
  amount NUMERIC, -- trade amount in CLP/USD
  units NUMERIC, -- units bought/sold
  notes TEXT,
  executed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rebalance_exec_client ON rebalance_executions(client_id, executed_at DESC);
CREATE INDEX idx_rebalance_exec_advisor ON rebalance_executions(advisor_id, executed_at DESC);

-- RLS
ALTER TABLE rebalance_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors see own client executions"
  ON rebalance_executions FOR SELECT
  USING (advisor_id IN (
    SELECT id FROM advisors WHERE email = auth.jwt() ->> 'email'
  ));

CREATE POLICY "Service role manages executions"
  ON rebalance_executions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add rebalance_alert type to advisor_notifications
ALTER TABLE advisor_notifications DROP CONSTRAINT IF EXISTS advisor_notifications_type_check;
ALTER TABLE advisor_notifications ADD CONSTRAINT advisor_notifications_type_check
  CHECK (type IN ('cartola_upload', 'questionnaire_completed', 'new_message', 'report_ready', 'rebalance_alert'));

-- Add drift_threshold to advisors table (default 5%)
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS drift_threshold NUMERIC DEFAULT 5;
