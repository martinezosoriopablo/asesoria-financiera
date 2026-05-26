-- Comite -> Radiografia Pipeline: schema updates
-- 1. Recreate model_portfolios with updated CHECK (5 profiles) + sleeves column
-- 2. Add custodian columns to portfolio_snapshots

-- 1. model_portfolios (table does NOT exist in production yet)
DROP TABLE IF EXISTS model_portfolios CASCADE;
DROP FUNCTION IF EXISTS set_model_portfolio_version() CASCADE;

CREATE TABLE model_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL DEFAULT 1,
  report_date DATE NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN (
    'conservador', 'moderado_conservador', 'moderado',
    'moderado_agresivo', 'agresivo'
  )),
  posiciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  sleeves JSONB NOT NULL DEFAULT '[]'::jsonb,
  nota_comite TEXT,
  created_by UUID REFERENCES advisors(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (perfil, report_date)
);

-- Auto-increment version per report_date
CREATE OR REPLACE FUNCTION set_model_portfolio_version()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
  FROM model_portfolios
  WHERE report_date = NEW.report_date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_model_portfolio_version
  BEFORE INSERT ON model_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION set_model_portfolio_version();

-- RLS
ALTER TABLE model_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read all model portfolios"
  ON model_portfolios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advisors can insert model portfolios"
  ON model_portfolios FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator can delete own model portfolios"
  ON model_portfolios FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Service role full access model_portfolios"
  ON model_portfolios FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Add custodian columns to portfolio_snapshots
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS custodian TEXT,
  ADD COLUMN IF NOT EXISTS custodian_type TEXT
    CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));
