-- Monthly AI usage tracking per advisor (visibility only, no blocking)

CREATE TABLE IF NOT EXISTS advisor_ai_usage (
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  month TEXT NOT NULL,              -- '2026-04'
  tokens_used BIGINT DEFAULT 0,
  cost_usd DECIMAL(10,4) DEFAULT 0,
  calls_count INT DEFAULT 0,
  PRIMARY KEY (advisor_id, month)
);

COMMENT ON TABLE advisor_ai_usage
  IS 'Monthly AI usage tracking per advisor. Visibility only, no blocking.';

-- RLS: advisors can only see their own usage
ALTER TABLE advisor_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_own_usage"
  ON advisor_ai_usage FOR SELECT
  USING (advisor_id = auth.uid());

-- No INSERT/UPDATE policy — API routes use service_role which bypasses RLS.

-- Atomic upsert for usage increments (called from API with service_role)
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_advisor_id UUID,
  p_month TEXT,
  p_tokens BIGINT,
  p_cost DECIMAL(10,4)
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO advisor_ai_usage (advisor_id, month, tokens_used, cost_usd, calls_count)
  VALUES (p_advisor_id, p_month, p_tokens, p_cost, 1)
  ON CONFLICT (advisor_id, month)
  DO UPDATE SET
    tokens_used = advisor_ai_usage.tokens_used + EXCLUDED.tokens_used,
    cost_usd = advisor_ai_usage.cost_usd + EXCLUDED.cost_usd,
    calls_count = advisor_ai_usage.calls_count + 1;
$$;
