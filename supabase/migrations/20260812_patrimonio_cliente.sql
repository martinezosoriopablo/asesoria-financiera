-- Patrimonio del cliente (sub-proyecto A): seguros, inmuebles y activos financieros
-- manuales. Moneda por campo (par *_monto + *_moneda). RLS por get_accessible_client_ids().

-- 1. Seguros: una fila por póliza.
CREATE TABLE IF NOT EXISTS client_seguros (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                      text NOT NULL CHECK (tipo IN ('vida','salud','vida_con_ahorro','otros')),
  compania                  text,
  numero_poliza             text,
  prima_monto               numeric,
  prima_moneda              text CHECK (prima_moneda IN ('CLP','UF','USD')),
  prima_periodicidad        text NOT NULL DEFAULT 'mensual' CHECK (prima_periodicidad IN ('mensual','anual')),
  cobertura_monto           numeric,
  cobertura_moneda          text CHECK (cobertura_moneda IN ('CLP','UF','USD')),
  cobertura_desc            text,
  beneficiarios             text,
  devuelve_prima            boolean NOT NULL DEFAULT false,
  devolucion_pct            numeric DEFAULT 100,
  fecha_inicio              date,
  fecha_termino             date,
  componente_ahorro_monto   numeric,
  componente_ahorro_moneda  text CHECK (componente_ahorro_moneda IN ('CLP','UF','USD')),
  notas                     text,
  created_by                uuid REFERENCES advisors(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_seguros_client ON client_seguros(client_id);

-- 2. Inmuebles: una fila por propiedad. Crédito hipotecario embebido (1:1).
CREATE TABLE IF NOT EXISTS client_inmuebles (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                           text NOT NULL CHECK (tipo IN ('inversion','habitacion')),
  etiqueta                       text,
  ubicacion                      text,
  valor_compra_monto             numeric,
  valor_compra_moneda            text CHECK (valor_compra_moneda IN ('CLP','UF','USD')),
  fecha_compra                   date,
  valor_estimado_venta_monto     numeric,
  valor_estimado_venta_moneda    text CHECK (valor_estimado_venta_moneda IN ('CLP','UF','USD')),
  tiene_credito                  boolean NOT NULL DEFAULT false,
  credito_saldo_monto            numeric,
  credito_saldo_moneda           text CHECK (credito_saldo_moneda IN ('CLP','UF','USD')),
  credito_tasa_anual             numeric,
  credito_plazo_meses_restantes  integer,
  credito_cuota_monto            numeric,
  credito_cuota_moneda           text CHECK (credito_cuota_moneda IN ('CLP','UF','USD')),
  se_arrienda                    boolean NOT NULL DEFAULT false,
  arriendo_monto                 numeric,
  arriendo_moneda                text CHECK (arriendo_moneda IN ('CLP','UF','USD')),
  notas                          text,
  created_by                     uuid REFERENCES advisors(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_inmuebles_client ON client_inmuebles(client_id);

-- 3. Activos financieros manuales (el portafolio trackeado NO va aquí).
CREATE TABLE IF NOT EXISTS client_activos_financieros (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                 text NOT NULL CHECK (tipo IN ('apv','afp','ahorro_periodico','cuenta_ahorro','otro')),
  institucion          text,
  saldo_monto          numeric,
  saldo_moneda         text CHECK (saldo_moneda IN ('CLP','UF','USD')),
  aporte_monto         numeric,
  aporte_moneda        text CHECK (aporte_moneda IN ('CLP','UF','USD')),
  aporte_periodicidad  text CHECK (aporte_periodicidad IN ('mensual','anual')),
  aporte_es_variable   boolean NOT NULL DEFAULT false,
  regimen              text CHECK (regimen IN ('A','B')),
  notas                text,
  created_by           uuid REFERENCES advisors(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_activos_client ON client_activos_financieros(client_id);

-- RLS: asesores leen lo accesible; el service role (rutas API) gestiona todo.
ALTER TABLE client_seguros ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activos_financieros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adv_read_seguros" ON client_seguros FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_seguros" ON client_seguros FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "adv_read_inmuebles" ON client_inmuebles FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_inmuebles" ON client_inmuebles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "adv_read_activos" ON client_activos_financieros FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_activos" ON client_activos_financieros FOR ALL TO service_role
  USING (true) WITH CHECK (true);
