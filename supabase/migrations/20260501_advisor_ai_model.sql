-- Add AI model preference to advisors
ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS preferred_ai_model TEXT
  DEFAULT 'claude-sonnet-4-20250514'
  CHECK (preferred_ai_model IN ('claude-sonnet-4-20250514', 'claude-opus-4-20250514'));

COMMENT ON COLUMN advisors.preferred_ai_model
  IS 'Preferred Claude model for AI-powered features. Sonnet = fast/cheap, Opus = best reasoning.';
