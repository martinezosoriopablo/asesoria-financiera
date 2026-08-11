-- Repositorio unificado de reportes: catálogo de tipos + reportes + vista de vigentes.

CREATE TABLE IF NOT EXISTS report_types (
  id            text PRIMARY KEY,
  label         text NOT NULL,
  scope_key     text NOT NULL CHECK (scope_key IN ('date','period','month','perfil')),
  default_usos  text[] NOT NULL DEFAULT '{}',
  formatos      text[] NOT NULL DEFAULT '{html}',
  is_custom     boolean NOT NULL DEFAULT false,
  orden         int NOT NULL DEFAULT 100,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL REFERENCES report_types(id),
  title         text,
  report_date   date NOT NULL,
  period        text,
  perfil        text,
  content_html  text,
  payload       jsonb,
  pdf_url       text,
  audio_url     text,
  usos          text[],
  uploaded_by   uuid REFERENCES advisors(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_type_date ON reports(type, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_scope ON reports(type, period, perfil, report_date DESC);

CREATE OR REPLACE VIEW vw_reports_vigentes AS
SELECT DISTINCT ON (r.type, COALESCE(r.period,''), COALESCE(r.perfil,''))
       r.*,
       COALESCE(r.usos, rt.default_usos) AS usos_efectivos
FROM reports r
JOIN report_types rt ON rt.id = r.type
ORDER BY r.type, COALESCE(r.period,''), COALESCE(r.perfil,''),
         r.report_date DESC, r.created_at DESC;

-- RLS (misma política que comite_reports): lectura para advisors, escritura service-role.
ALTER TABLE report_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisors_read_report_types" ON report_types
  FOR SELECT USING (auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_report_types" ON report_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "advisors_read_reports" ON reports
  FOR SELECT USING (auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_reports" ON reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed de tipos curados
INSERT INTO report_types (id, label, scope_key, default_usos, formatos, orden) VALUES
  ('macro','Macro','date','{distribucion,insumo_cartera}','{html,pdf}',10),
  ('rv','Renta Variable','date','{distribucion,insumo_cartera}','{html,pdf}',20),
  ('rf','Renta Fija','date','{distribucion,insumo_cartera}','{html,pdf}',30),
  ('asset_allocation','Asset Allocation','date','{insumo_cartera}','{html,json,pdf}',40),
  ('arbol_decision','Árbol de Decisión','date','{insumo_cartera}','{html,json,pdf}',50),
  ('sectorial','Análisis sectorial/coyuntura','date','{distribucion,insumo_cartera}','{html,pdf}',60),
  ('seleccion_acciones','Selección de acciones','date','{insumo_cartera}','{html,pdf}',70),
  ('diario','Reporte diario (AM/PM)','period','{distribucion}','{html,mp3}',80),
  ('cierre_mensual','Cierre mensual','month','{insumo_cierre,distribucion}','{html,pdf}',90),
  ('cartera_modelo','Cartera modelo','perfil','{}','{json}',100)
ON CONFLICT (id) DO NOTHING;
