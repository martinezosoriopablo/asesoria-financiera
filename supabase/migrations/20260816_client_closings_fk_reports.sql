-- Re-apunta el FK client_monthly_closings.monthly_report_id de la tabla legacy
-- monthly_reports → la tabla unificada reports. Fase 4 re-apuntó el CÓDIGO
-- (lee/escribe reports vía vw_reports_vigentes) pero dejó el FK apuntando a
-- monthly_reports, causando "violates foreign key constraint
-- client_monthly_closings_monthly_report_id_fkey" al guardar un cierre.

ALTER TABLE client_monthly_closings
  DROP CONSTRAINT IF EXISTS client_monthly_closings_monthly_report_id_fkey;

-- Mapear los registros existentes que apuntan a un id de monthly_reports (legacy)
-- al id equivalente en reports (mismo mes: reports.period = monthly_reports.month).
UPDATE client_monthly_closings c
SET monthly_report_id = r.id
FROM monthly_reports m
JOIN reports r ON r.type = 'cierre_mensual' AND r.period = m.month
WHERE c.monthly_report_id = m.id;

-- Cualquier referencia que no se pudo mapear a reports se anula (evita violar el
-- nuevo FK; el cierre conserva su contenido, solo pierde el link al reporte viejo).
UPDATE client_monthly_closings c
SET monthly_report_id = NULL
WHERE c.monthly_report_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = c.monthly_report_id);

ALTER TABLE client_monthly_closings
  ADD CONSTRAINT client_monthly_closings_monthly_report_id_fkey
  FOREIGN KEY (monthly_report_id) REFERENCES reports(id) ON DELETE SET NULL;
