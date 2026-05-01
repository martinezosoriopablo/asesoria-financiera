-- Add questionnaire frequency and tracking to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS questionnaire_frequency TEXT
    DEFAULT '1y'
    CHECK (questionnaire_frequency IN ('90d', '180d', '1y', '2y', 'none')),
  ADD COLUMN IF NOT EXISTS last_questionnaire_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_questionnaire_date TIMESTAMPTZ;

-- Backfill last_questionnaire_date from most recent risk_profile
UPDATE clients c
SET last_questionnaire_date = (
  SELECT MAX(created_at) FROM risk_profiles rp WHERE rp.client_id = c.id
)
WHERE EXISTS (SELECT 1 FROM risk_profiles rp WHERE rp.client_id = c.id);

-- Compute initial next_questionnaire_date based on default '1y'
UPDATE clients
SET next_questionnaire_date = last_questionnaire_date + INTERVAL '1 year'
WHERE last_questionnaire_date IS NOT NULL;

COMMENT ON COLUMN clients.questionnaire_frequency
  IS 'How often the client should re-take the risk questionnaire: 90d, 180d, 1y, 2y, or none';
