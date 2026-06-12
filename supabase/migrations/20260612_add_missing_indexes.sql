-- Indexes on advisor_id for frequently queried tables
-- (UNIQUE constraints include advisor_id but as part of composite key,
--  so single-column lookups still benefit from a dedicated index)

CREATE INDEX IF NOT EXISTS idx_custodian_config_advisor
  ON custodian_config(advisor_id);

CREATE INDEX IF NOT EXISTS idx_model_fund_mapping_advisor
  ON model_fund_mapping(advisor_id);

CREATE INDEX IF NOT EXISTS idx_advisor_preferred_funds_advisor
  ON advisor_preferred_funds(advisor_id);
