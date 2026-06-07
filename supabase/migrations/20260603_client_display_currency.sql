-- Add display_currency preference to clients
-- Stores the consolidation currency chosen during cartola upload
ALTER TABLE clients ADD COLUMN IF NOT EXISTS display_currency text DEFAULT 'CLP';
