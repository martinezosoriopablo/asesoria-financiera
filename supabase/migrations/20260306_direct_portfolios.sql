-- Migración para Direct Portfolios (Portafolios con acciones y bonos directos)
-- Fecha: 2026-03-06

-- Tabla de portafolios directos
CREATE TABLE IF NOT EXISTS direct_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES advisors(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  nombre VARCHAR(255) NOT NULL,
  perfil_riesgo VARCHAR(50), -- defensivo, moderado, crecimiento, agresivo
  descripcion TEXT,
  moneda VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'activo', -- activo, inactivo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Holdings del portafolio
CREATE TABLE IF NOT EXISTS direct_portfolio_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES direct_portfolios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL, -- 'stock_us', 'stock_cl', 'bond'
  ticker VARCHAR(20),
  nombre VARCHAR(255),
  cantidad DECIMAL(18,6) NOT NULL,
  precio_compra DECIMAL(18,4),
  fecha_compra DATE,
  -- Campos específicos para bonos
  cupon DECIMAL(5,3),        -- tasa cupón anual (ej: 5.25%)
  vencimiento DATE,
  valor_nominal DECIMAL(18,2),
  cusip VARCHAR(20),         -- Identificador del bono
  isin VARCHAR(20),          -- Identificador internacional
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache de precios de securities (opcional, para performance)
CREATE TABLE IF NOT EXISTS security_prices_cache (
  ticker VARCHAR(30) PRIMARY KEY,
  tipo VARCHAR(20),
  nombre VARCHAR(255),
  precio DECIMAL(18,4),
  moneda VARCHAR(10),
  exchange VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_direct_portfolios_advisor ON direct_portfolios(advisor_id);
CREATE INDEX IF NOT EXISTS idx_direct_portfolios_client ON direct_portfolios(client_id);
CREATE INDEX IF NOT EXISTS idx_direct_portfolio_holdings_portfolio ON direct_portfolio_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_security_prices_cache_updated ON security_prices_cache(updated_at);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger a las tablas
DROP TRIGGER IF EXISTS update_direct_portfolios_updated_at ON direct_portfolios;
CREATE TRIGGER update_direct_portfolios_updated_at
    BEFORE UPDATE ON direct_portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_direct_portfolio_holdings_updated_at ON direct_portfolio_holdings;
CREATE TRIGGER update_direct_portfolio_holdings_updated_at
    BEFORE UPDATE ON direct_portfolio_holdings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - opcional si ya tienen políticas globales
-- ALTER TABLE direct_portfolios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE direct_portfolio_holdings ENABLE ROW LEVEL SECURITY;

-- Comentarios para documentación
COMMENT ON TABLE direct_portfolios IS 'Portafolios directos de acciones y bonos individuales';
COMMENT ON TABLE direct_portfolio_holdings IS 'Holdings individuales (acciones/bonos) dentro de un portafolio directo';
COMMENT ON TABLE security_prices_cache IS 'Cache de precios de valores para reducir llamadas a APIs externas';
COMMENT ON COLUMN direct_portfolio_holdings.tipo IS 'Tipo de valor: stock_us, stock_cl, bond';
COMMENT ON COLUMN direct_portfolio_holdings.cupon IS 'Tasa cupón anual del bono (solo para tipo bond)';
