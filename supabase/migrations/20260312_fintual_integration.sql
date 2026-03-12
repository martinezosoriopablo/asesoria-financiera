-- Migración para integración con API de Fintual
-- Tablas para almacenar datos de fondos mutuos chilenos

-- Tabla de proveedores (AGFs) de Fintual
CREATE TABLE IF NOT EXISTS fintual_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fintual_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por ID de Fintual
CREATE INDEX IF NOT EXISTS idx_fintual_providers_fintual_id ON fintual_providers(fintual_id);

-- Tabla de fondos/series de Fintual
CREATE TABLE IF NOT EXISTS fintual_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fintual_id TEXT UNIQUE NOT NULL, -- ID de la serie en Fintual (real_asset)
  conceptual_asset_id TEXT, -- ID del fondo conceptual
  provider_id TEXT, -- ID del proveedor en Fintual
  provider_name TEXT, -- Nombre de la AGF
  fund_name TEXT NOT NULL, -- Nombre del fondo
  serie_name TEXT, -- Nombre de la serie (A, B, C, etc.)
  symbol TEXT, -- Símbolo (ej: "FFMM-8177-A")
  run TEXT, -- RUN del fondo (código CMF)
  currency TEXT DEFAULT 'CLP',
  last_price DECIMAL(18, 6), -- Último valor cuota
  last_price_date DATE, -- Fecha del último precio
  expense_ratio DECIMAL(8, 4), -- TAC/Expense ratio
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda
CREATE INDEX IF NOT EXISTS idx_fintual_funds_fintual_id ON fintual_funds(fintual_id);
CREATE INDEX IF NOT EXISTS idx_fintual_funds_run ON fintual_funds(run);
CREATE INDEX IF NOT EXISTS idx_fintual_funds_provider ON fintual_funds(provider_name);
CREATE INDEX IF NOT EXISTS idx_fintual_funds_name ON fintual_funds(fund_name);

-- Tabla de precios históricos
CREATE TABLE IF NOT EXISTS fintual_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID REFERENCES fintual_funds(id) ON DELETE CASCADE,
  fintual_fund_id TEXT NOT NULL, -- ID de Fintual para referencia directa
  date DATE NOT NULL,
  price DECIMAL(18, 6) NOT NULL, -- Valor cuota
  nav DECIMAL(18, 2), -- Net Asset Value
  total_assets DECIMAL(18, 2), -- Activos totales
  patrimony DECIMAL(18, 2), -- Patrimonio
  shares_outstanding DECIMAL(18, 2), -- Cuotas en circulación
  shareholders INTEGER, -- Número de partícipes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fintual_fund_id, date)
);

-- Índices para precios
CREATE INDEX IF NOT EXISTS idx_fintual_prices_fund_date ON fintual_prices(fintual_fund_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fintual_prices_date ON fintual_prices(date DESC);

-- Vista para obtener fondos con último precio
CREATE OR REPLACE VIEW vw_fintual_funds_latest AS
SELECT
  f.*,
  p.price as current_price,
  p.date as price_date,
  p.patrimony,
  p.shareholders
FROM fintual_funds f
LEFT JOIN LATERAL (
  SELECT price, date, patrimony, shareholders
  FROM fintual_prices
  WHERE fintual_fund_id = f.fintual_id
  ORDER BY date DESC
  LIMIT 1
) p ON true;

-- Función para buscar fondos por nombre o RUN
CREATE OR REPLACE FUNCTION search_fintual_funds(search_term TEXT)
RETURNS TABLE (
  id UUID,
  fintual_id TEXT,
  provider_name TEXT,
  fund_name TEXT,
  serie_name TEXT,
  run TEXT,
  currency TEXT,
  last_price DECIMAL,
  last_price_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.fintual_id,
    f.provider_name,
    f.fund_name,
    f.serie_name,
    f.run,
    f.currency,
    f.last_price,
    f.last_price_date
  FROM fintual_funds f
  WHERE
    f.fund_name ILIKE '%' || search_term || '%'
    OR f.provider_name ILIKE '%' || search_term || '%'
    OR f.run ILIKE '%' || search_term || '%'
    OR f.symbol ILIKE '%' || search_term || '%'
  ORDER BY f.fund_name
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE fintual_providers IS 'Proveedores/AGFs de la API de Fintual';
COMMENT ON TABLE fintual_funds IS 'Catálogo de fondos mutuos chilenos desde Fintual';
COMMENT ON TABLE fintual_prices IS 'Precios históricos de fondos desde Fintual';
