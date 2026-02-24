-- Script para crear la tabla de snapshots de portfolio
-- Ejecutar en Supabase SQL Editor

-- Tabla para guardar snapshots históricos del portfolio
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Valores totales
  total_value DECIMAL(15, 2) NOT NULL,
  total_cost_basis DECIMAL(15, 2),
  unrealized_gain_loss DECIMAL(15, 2),

  -- Composición por clase de activo (porcentajes)
  equity_percent DECIMAL(5, 2),
  fixed_income_percent DECIMAL(5, 2),
  alternatives_percent DECIMAL(5, 2),
  cash_percent DECIMAL(5, 2),

  -- Valores por clase de activo
  equity_value DECIMAL(15, 2),
  fixed_income_value DECIMAL(15, 2),
  alternatives_value DECIMAL(15, 2),
  cash_value DECIMAL(15, 2),

  -- Holdings detallados (JSON para flexibilidad)
  holdings JSONB,

  -- Indicadores calculados
  daily_return DECIMAL(8, 4),
  cumulative_return DECIMAL(8, 4),

  -- Metadata
  source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'statement', 'api'
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Índice único para evitar duplicados por día
  UNIQUE(client_id, snapshot_date)
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_client_date
  ON portfolio_snapshots(client_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date
  ON portfolio_snapshots(snapshot_date DESC);

-- Tabla para métricas calculadas (para no recalcular cada vez)
CREATE TABLE IF NOT EXISTS portfolio_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL, -- '1M', '3M', '6M', '1Y', 'YTD', 'ITD' (inception to date)

  -- Retornos
  total_return DECIMAL(8, 4),
  annualized_return DECIMAL(8, 4),

  -- Riesgo
  volatility DECIMAL(8, 4),
  max_drawdown DECIMAL(8, 4),

  -- Ratios
  sharpe_ratio DECIMAL(8, 4),
  sortino_ratio DECIMAL(8, 4),

  -- Comparación con benchmark
  benchmark_return DECIMAL(8, 4),
  alpha DECIMAL(8, 4),
  beta DECIMAL(8, 4),

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  start_date DATE,
  end_date DATE,

  UNIQUE(client_id, period)
);

-- Índice para métricas
CREATE INDEX IF NOT EXISTS idx_portfolio_metrics_client
  ON portfolio_metrics(client_id);

-- Agregar campo cartera_recomendada a clients si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'cartera_recomendada'
  ) THEN
    ALTER TABLE clients ADD COLUMN cartera_recomendada JSONB;
  END IF;
END $$;

-- RLS (Row Level Security) policies
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: advisors can see snapshots of their clients
CREATE POLICY "Advisors can view client snapshots" ON portfolio_snapshots
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "Advisors can insert client snapshots" ON portfolio_snapshots
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "Advisors can view client metrics" ON portfolio_metrics
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "Advisors can manage client metrics" ON portfolio_metrics
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

-- Comentarios
COMMENT ON TABLE portfolio_snapshots IS 'Snapshots históricos del valor y composición del portfolio';
COMMENT ON TABLE portfolio_metrics IS 'Métricas de rendimiento calculadas por periodo';
