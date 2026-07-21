-- Caché de mapeo de fondos internacionales: CUSIP/ISIN → símbolo de precio.
-- Poblada automáticamente por ensureIntlMappings() (Yahoo search por CUSIP/ISIN,
-- verificado por precio). Evita re-consultar Yahoo en cada valorización y elimina
-- la necesidad de agregar cada fondo UCITS a mano en INTL_FUND_MAP.
-- resolved=false = se buscó pero no se encontró (caché negativa, evita reintentos).
CREATE TABLE IF NOT EXISTS international_fund_map (
  security_id  text PRIMARY KEY,          -- CUSIP o ISIN como aparece en la cartola
  yahoo_symbol text,                       -- ID Morningstar (0P...) u otro símbolo Yahoo
  eodhd_symbol text,                       -- alternativa EODHD (ISIN.EUFUND)
  currency     text NOT NULL DEFAULT 'USD',
  fund_name    text,
  resolved     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
