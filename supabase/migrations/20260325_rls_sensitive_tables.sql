-- Migración: RLS completo en tablas sensibles
-- Fecha: 2026-03-25
-- Tablas: clients, portfolio_snapshots, client_cartolas, risk_profiles
-- Nota: Los API routes usan service_role (bypasa RLS). Estas políticas
--       protegen contra acceso directo con anon key desde el browser.

-- ============================================================
-- 0. Función helper: IDs de advisors accesibles (self + subordinates)
-- ============================================================
CREATE OR REPLACE FUNCTION get_accessible_advisor_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- El advisor mismo
  SELECT auth.uid()
  UNION
  -- Subordinados directos (admin -> advisor)
  SELECT id FROM advisors WHERE parent_advisor_id = auth.uid()
$$;

COMMENT ON FUNCTION get_accessible_advisor_ids()
  IS 'Retorna el ID del advisor autenticado más sus subordinados directos';

-- ============================================================
-- 1. clients — políticas de advisor
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Advisor puede ver sus clientes (y subordinados si es admin)
CREATE POLICY "advisor_select_clients"
  ON clients FOR SELECT
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

-- Advisor puede crear clientes asignados a sí mismo
CREATE POLICY "advisor_insert_clients"
  ON clients FOR INSERT
  WITH CHECK (
    asesor_id = auth.uid()
  );

-- Advisor puede actualizar sus clientes (y subordinados si es admin)
CREATE POLICY "advisor_update_clients"
  ON clients FOR UPDATE
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

-- Advisor puede eliminar (soft delete) sus clientes (y subordinados)
CREATE POLICY "advisor_delete_clients"
  ON clients FOR DELETE
  USING (
    asesor_id IN (SELECT get_accessible_advisor_ids())
  );

-- ============================================================
-- 2. portfolio_snapshots — políticas de advisor
-- ============================================================
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_snapshots"
  ON portfolio_snapshots FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_snapshots"
  ON portfolio_snapshots FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_snapshots"
  ON portfolio_snapshots FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- 3. client_cartolas — RLS completo (no tenía ninguna política)
-- ============================================================
ALTER TABLE client_cartolas ENABLE ROW LEVEL SECURITY;

-- Advisor access
CREATE POLICY "advisor_select_cartolas"
  ON client_cartolas FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_cartolas"
  ON client_cartolas FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_cartolas"
  ON client_cartolas FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_cartolas"
  ON client_cartolas FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- Client portal: cliente puede leer sus propias cartolas
CREATE POLICY "client_read_own_cartolas"
  ON client_cartolas FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = client_cartolas.client_id
    )
  );

-- ============================================================
-- 4. risk_profiles — políticas de advisor
-- ============================================================
ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_risk_profiles"
  ON risk_profiles FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_risk_profiles"
  ON risk_profiles FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_risk_profiles"
  ON risk_profiles FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_risk_profiles"
  ON risk_profiles FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- Comentarios
-- ============================================================
COMMENT ON POLICY "advisor_select_clients" ON clients
  IS 'Advisor ve clientes propios + de subordinados si es admin';
COMMENT ON POLICY "advisor_select_snapshots" ON portfolio_snapshots
  IS 'Advisor ve snapshots de sus clientes + subordinados';
COMMENT ON POLICY "advisor_select_cartolas" ON client_cartolas
  IS 'Advisor ve cartolas de sus clientes + subordinados';
COMMENT ON POLICY "client_read_own_cartolas" ON client_cartolas
  IS 'Cliente portal lee sus propias cartolas';
COMMENT ON POLICY "advisor_select_risk_profiles" ON risk_profiles
  IS 'Advisor ve perfiles de riesgo de sus clientes + subordinados';
