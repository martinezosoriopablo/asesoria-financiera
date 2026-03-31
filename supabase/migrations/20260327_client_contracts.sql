-- Add contract_url to clients for storing the service agreement PDF
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contract_url TEXT,
  ADD COLUMN IF NOT EXISTS contract_uploaded_at TIMESTAMPTZ;

-- Create storage bucket for contracts (run in Supabase dashboard if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false)
-- ON CONFLICT DO NOTHING;
