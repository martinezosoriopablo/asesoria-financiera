-- Migración: Habilitar RLS en tablas sensibles
-- Fecha: 2026-03-16
-- Tablas: direct_portfolios, direct_portfolio_holdings, advisor_google_tokens

-- ============================================================
-- 1. direct_portfolios — portafolios de clientes por advisor
-- ============================================================
ALTER TABLE direct_portfolios ENABLE ROW LEVEL SECURITY;

-- Advisors pueden ver sus propios portafolios
CREATE POLICY "Advisors can view own portfolios"
  ON direct_portfolios FOR SELECT
  USING (advisor_id = auth.uid());

-- Advisors pueden crear portafolios asignados a sí mismos
CREATE POLICY "Advisors can insert own portfolios"
  ON direct_portfolios FOR INSERT
  WITH CHECK (advisor_id = auth.uid());

-- Advisors pueden actualizar sus propios portafolios
CREATE POLICY "Advisors can update own portfolios"
  ON direct_portfolios FOR UPDATE
  USING (advisor_id = auth.uid());

-- Advisors pueden eliminar sus propios portafolios
CREATE POLICY "Advisors can delete own portfolios"
  ON direct_portfolios FOR DELETE
  USING (advisor_id = auth.uid());

-- ============================================================
-- 2. direct_portfolio_holdings — holdings dentro de portafolios
-- ============================================================
ALTER TABLE direct_portfolio_holdings ENABLE ROW LEVEL SECURITY;

-- Advisors pueden ver holdings de sus portafolios
CREATE POLICY "Advisors can view own holdings"
  ON direct_portfolio_holdings FOR SELECT
  USING (
    portfolio_id IN (
      SELECT id FROM direct_portfolios WHERE advisor_id = auth.uid()
    )
  );

-- Advisors pueden insertar holdings en sus portafolios
CREATE POLICY "Advisors can insert own holdings"
  ON direct_portfolio_holdings FOR INSERT
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM direct_portfolios WHERE advisor_id = auth.uid()
    )
  );

-- Advisors pueden actualizar holdings de sus portafolios
CREATE POLICY "Advisors can update own holdings"
  ON direct_portfolio_holdings FOR UPDATE
  USING (
    portfolio_id IN (
      SELECT id FROM direct_portfolios WHERE advisor_id = auth.uid()
    )
  );

-- Advisors pueden eliminar holdings de sus portafolios
CREATE POLICY "Advisors can delete own holdings"
  ON direct_portfolio_holdings FOR DELETE
  USING (
    portfolio_id IN (
      SELECT id FROM direct_portfolios WHERE advisor_id = auth.uid()
    )
  );

-- ============================================================
-- 3. advisor_google_tokens — tokens OAuth (datos muy sensibles)
-- ============================================================
ALTER TABLE advisor_google_tokens ENABLE ROW LEVEL SECURITY;

-- Cada advisor solo puede ver sus propios tokens
CREATE POLICY "Advisors can view own google tokens"
  ON advisor_google_tokens FOR SELECT
  USING (advisor_id = auth.uid());

-- Cada advisor solo puede insertar sus propios tokens
CREATE POLICY "Advisors can insert own google tokens"
  ON advisor_google_tokens FOR INSERT
  WITH CHECK (advisor_id = auth.uid());

-- Cada advisor solo puede actualizar sus propios tokens
CREATE POLICY "Advisors can update own google tokens"
  ON advisor_google_tokens FOR UPDATE
  USING (advisor_id = auth.uid());

-- Cada advisor solo puede eliminar sus propios tokens
CREATE POLICY "Advisors can delete own google tokens"
  ON advisor_google_tokens FOR DELETE
  USING (advisor_id = auth.uid());

-- ============================================================
-- Comentarios
-- ============================================================
COMMENT ON POLICY "Advisors can view own portfolios" ON direct_portfolios
  IS 'Cada advisor solo ve portafolios donde es el advisor asignado';
COMMENT ON POLICY "Advisors can view own holdings" ON direct_portfolio_holdings
  IS 'Holdings visibles solo si el portafolio pertenece al advisor';
COMMENT ON POLICY "Advisors can view own google tokens" ON advisor_google_tokens
  IS 'Tokens OAuth son estrictamente privados por advisor';
