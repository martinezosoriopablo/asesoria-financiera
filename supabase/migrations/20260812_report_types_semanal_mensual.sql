-- Nuevos tipos de reporte de calendario para el repositorio unificado:
-- semanal (scope period, admite podcast mp3) y mensual (scope month, distinto del
-- cierre formal). Idempotente. Los generadores externos los ingieren vía
-- POST /api/reports/ingest.
INSERT INTO report_types (id, label, scope_key, default_usos, formatos, is_custom, orden) VALUES
  ('semanal', 'Reporte semanal', 'period', ARRAY['distribucion']::text[], ARRAY['html','pdf','mp3']::text[], false, 45),
  ('mensual', 'Reporte mensual', 'month',  ARRAY['distribucion']::text[], ARRAY['html','pdf']::text[],        false, 65)
ON CONFLICT (id) DO NOTHING;
