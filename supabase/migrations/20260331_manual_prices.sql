-- Tabla para precios subidos manualmente por el asesor
-- Usada cuando no existe serie de tiempo automática (Yahoo, Fintual, etc.)
-- El asesor sube un CSV con formato estricto: security_id, date, price
CREATE TABLE IF NOT EXISTS manual_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  security_id TEXT NOT NULL,          -- CUSIP, ISIN, ticker, o cualquier identificador del holding
  price_date DATE NOT NULL,
  price DECIMAL(18,6) NOT NULL CHECK (price > 0),
  currency TEXT DEFAULT 'USD',
  note TEXT,                          -- opcional: fuente del precio
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(security_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_manual_prices_security_date
  ON manual_prices(security_id, price_date DESC);

ALTER TABLE manual_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_manual_prices"
  ON manual_prices FOR SELECT
  USING (auth.uid() IN (SELECT id FROM advisors));

CREATE POLICY "advisor_insert_manual_prices"
  ON manual_prices FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM advisors));

CREATE POLICY "advisor_delete_manual_prices"
  ON manual_prices FOR DELETE
  USING (created_by = auth.uid());
