-- Tabla para registrar dividendos recibidos en el portfolio
-- Los dividendos aumentan el valor del portfolio SIN cambiar las cuotas,
-- así el valor cuota sube y la rentabilidad TWR refleja el retorno total
CREATE TABLE IF NOT EXISTS portfolio_dividends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dividend_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_portfolio_dividends_client
  ON portfolio_dividends(client_id, dividend_date DESC);

-- RLS
ALTER TABLE portfolio_dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_dividends"
  ON portfolio_dividends FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = portfolio_dividends.client_id
      AND c.asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_insert_dividends"
  ON portfolio_dividends FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = portfolio_dividends.client_id
      AND c.asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_delete_dividends"
  ON portfolio_dividends FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = portfolio_dividends.client_id
      AND c.asesor_id = auth.uid()
    )
  );
