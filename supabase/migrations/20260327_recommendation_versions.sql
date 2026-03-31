-- Recommendation versioning: track every cartera recomendada over time
CREATE TABLE IF NOT EXISTS recommendation_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  cartera_recomendada JSONB NOT NULL,
  applied_by TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_versions_client
  ON recommendation_versions(client_id, version_number DESC);

-- Unique constraint: one version number per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_versions_unique
  ON recommendation_versions(client_id, version_number);

-- Seed existing recommendations as version 1
INSERT INTO recommendation_versions (client_id, version_number, cartera_recomendada, applied_by, applied_at)
SELECT
  id AS client_id,
  1 AS version_number,
  cartera_recomendada,
  cartera_recomendada->>'aplicadoPor' AS applied_by,
  COALESCE(
    (cartera_recomendada->>'aplicadoEn')::timestamptz,
    updated_at
  ) AS applied_at
FROM clients
WHERE cartera_recomendada IS NOT NULL
  AND cartera_recomendada != 'null'::jsonb
  AND jsonb_array_length(COALESCE(cartera_recomendada->'cartera', '[]'::jsonb)) > 0;
