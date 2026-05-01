-- Migración: RLS en 5 tablas sin cobertura
-- Fecha: 2026-05-01
-- Tablas: client_report_config, client_reports, recommendation_versions,
--         meetings, client_interactions
-- Nota: Los API routes usan service_role (bypasa RLS). Estas políticas
--       protegen contra acceso directo con anon key desde el browser.

-- ============================================================
-- 1. client_report_config — políticas de advisor
-- ============================================================
ALTER TABLE client_report_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_report_config"
  ON client_report_config FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_report_config"
  ON client_report_config FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_update_report_config"
  ON client_report_config FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_report_config"
  ON client_report_config FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- 2. client_reports — políticas de advisor + client portal
-- ============================================================
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_reports"
  ON client_reports FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_reports"
  ON client_reports FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_update_reports"
  ON client_reports FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_reports"
  ON client_reports FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- Client portal: cliente puede leer sus propios reportes
CREATE POLICY "client_read_own_reports"
  ON client_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = client_reports.client_id
    )
  );

-- ============================================================
-- 3. recommendation_versions — políticas de advisor
-- ============================================================
ALTER TABLE recommendation_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_recommendations"
  ON recommendation_versions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_recommendations"
  ON recommendation_versions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_update_recommendations"
  ON recommendation_versions FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_recommendations"
  ON recommendation_versions FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- 4. meetings — políticas de advisor (advisor_id directo)
-- ============================================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_meetings"
  ON meetings FOR SELECT
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

CREATE POLICY "advisor_insert_meetings"
  ON meetings FOR INSERT
  WITH CHECK (
    asesor_id = auth.uid()
  );

CREATE POLICY "advisor_update_meetings"
  ON meetings FOR UPDATE
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

CREATE POLICY "advisor_delete_meetings"
  ON meetings FOR DELETE
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

-- ============================================================
-- 5. client_interactions — políticas de advisor
-- ============================================================
ALTER TABLE client_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_interactions"
  ON client_interactions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_interactions"
  ON client_interactions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id = auth.uid()
    )
  );

CREATE POLICY "advisor_update_interactions"
  ON client_interactions FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_interactions"
  ON client_interactions FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- Comentarios
-- ============================================================
COMMENT ON POLICY "advisor_select_report_config" ON client_report_config
  IS 'Advisor ve configs de reportes de sus clientes + subordinados';
COMMENT ON POLICY "advisor_insert_report_config" ON client_report_config
  IS 'Advisor crea configs solo para sus propios clientes';
COMMENT ON POLICY "advisor_update_report_config" ON client_report_config
  IS 'Advisor actualiza configs de sus clientes + subordinados';
COMMENT ON POLICY "advisor_delete_report_config" ON client_report_config
  IS 'Advisor elimina configs de sus clientes + subordinados';

COMMENT ON POLICY "advisor_select_reports" ON client_reports
  IS 'Advisor ve reportes de sus clientes + subordinados';
COMMENT ON POLICY "advisor_insert_reports" ON client_reports
  IS 'Advisor crea reportes solo para sus propios clientes';
COMMENT ON POLICY "advisor_update_reports" ON client_reports
  IS 'Advisor actualiza reportes de sus clientes + subordinados';
COMMENT ON POLICY "advisor_delete_reports" ON client_reports
  IS 'Advisor elimina reportes de sus clientes + subordinados';
COMMENT ON POLICY "client_read_own_reports" ON client_reports
  IS 'Cliente portal lee sus propios reportes';

COMMENT ON POLICY "advisor_select_recommendations" ON recommendation_versions
  IS 'Advisor ve recomendaciones de sus clientes + subordinados';
COMMENT ON POLICY "advisor_insert_recommendations" ON recommendation_versions
  IS 'Advisor crea recomendaciones solo para sus propios clientes';
COMMENT ON POLICY "advisor_update_recommendations" ON recommendation_versions
  IS 'Advisor actualiza recomendaciones de sus clientes + subordinados';
COMMENT ON POLICY "advisor_delete_recommendations" ON recommendation_versions
  IS 'Advisor elimina recomendaciones de sus clientes + subordinados';

COMMENT ON POLICY "advisor_select_meetings" ON meetings
  IS 'Advisor ve sus reuniones + de subordinados';
COMMENT ON POLICY "advisor_insert_meetings" ON meetings
  IS 'Advisor crea reuniones solo asignadas a si mismo';
COMMENT ON POLICY "advisor_update_meetings" ON meetings
  IS 'Advisor actualiza sus reuniones + de subordinados';
COMMENT ON POLICY "advisor_delete_meetings" ON meetings
  IS 'Advisor elimina sus reuniones + de subordinados';

COMMENT ON POLICY "advisor_select_interactions" ON client_interactions
  IS 'Advisor ve interacciones de sus clientes + subordinados';
COMMENT ON POLICY "advisor_insert_interactions" ON client_interactions
  IS 'Advisor crea interacciones solo para sus propios clientes';
COMMENT ON POLICY "advisor_update_interactions" ON client_interactions
  IS 'Advisor actualiza interacciones de sus clientes + subordinados';
COMMENT ON POLICY "advisor_delete_interactions" ON client_interactions
  IS 'Advisor elimina interacciones de sus clientes + subordinados';
