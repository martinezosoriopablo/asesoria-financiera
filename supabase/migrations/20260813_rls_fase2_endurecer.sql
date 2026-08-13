-- Auditoría RLS ago 2026 — Fase 2: endurece el over-read/over-modify entre usuarios
-- AUTENTICADOS (la Fase 1, 20260813_fix_rls_public_leaks.sql, ya cerró la fuga a anon).
-- Aplicado y verificado en prod (smoke del asesor OK; anon sigue cerrado).
-- La app no se afecta: accede vía service role (salta RLS).

-- 1) get_accessible_client_ids -> SECURITY DEFINER (igual que get_accessible_advisor_ids).
--    Sin esto, al endurecer el SELECT de clients, la función quedaría filtrada por la propia
--    RLS de clients y perdería los clientes huérfanos/compartidos.
CREATE OR REPLACE FUNCTION get_accessible_client_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM clients WHERE asesor_id = auth.uid()
  UNION
  SELECT id FROM clients WHERE asesor_id IN (
    SELECT id FROM advisors WHERE parent_advisor_id = auth.uid()
  )
  UNION
  SELECT client_id FROM client_advisors WHERE advisor_id = auth.uid()
  UNION
  SELECT id FROM clients WHERE asesor_id IS NULL
$$;

-- 2) clients: quitar la política ALL que abría SELECT+modify a CUALQUIER autenticado.
--    SELECT restringido a los clientes accesibles del asesor (+ client_read_own_profile,
--    que se conserva). Se conservan advisor_insert/update/delete_clients.
DROP POLICY IF EXISTS "Solo usuarios autenticados pueden modificar clientes" ON clients;
DROP POLICY IF EXISTS "advisor_select_clients" ON clients;
CREATE POLICY "advisor_select_clients" ON clients FOR SELECT TO authenticated
  USING (id IN (SELECT get_accessible_client_ids()));

-- 3) advisors: quitar la política ALL (dejaba a cualquier autenticado leer Y modificar a
--    cualquier asesor). Mantener lectura para autenticados (directorio de staff; anon ya
--    bloqueado en Fase 1) y permitir editar solo el propio perfil o subordinados (admin).
DROP POLICY IF EXISTS "Solo usuarios autenticados pueden modificar asesores" ON advisors;
CREATE POLICY "advisors_select_authenticated" ON advisors FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "advisor_update_accessible" ON advisors FOR UPDATE TO authenticated
  USING (id IN (SELECT get_accessible_advisor_ids()))
  WITH CHECK (id IN (SELECT get_accessible_advisor_ids()));
