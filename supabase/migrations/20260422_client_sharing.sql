-- Tabla para compartir clientes entre asesores
-- El asesor_id en clients sigue siendo el "dueño" principal
-- Esta tabla permite acceso adicional a otros asesores

CREATE TABLE IF NOT EXISTS client_advisors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  shared_by UUID REFERENCES advisors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, advisor_id)
);

-- Index para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_client_advisors_advisor ON client_advisors(advisor_id);
CREATE INDEX IF NOT EXISTS idx_client_advisors_client ON client_advisors(client_id);

-- RLS
ALTER TABLE client_advisors ENABLE ROW LEVEL SECURITY;

-- Advisor puede ver sus propios shares
CREATE POLICY "advisor_select_shares" ON client_advisors
  FOR SELECT USING (
    advisor_id = auth.uid()
    OR shared_by = auth.uid()
    OR auth.uid() IN (SELECT get_accessible_advisor_ids())
  );

-- Solo el dueño del cliente o admin puede crear shares
CREATE POLICY "advisor_insert_shares" ON client_advisors
  FOR INSERT WITH CHECK (
    shared_by = auth.uid()
  );

-- Solo quien compartió o admin puede eliminar
CREATE POLICY "advisor_delete_shares" ON client_advisors
  FOR DELETE USING (
    shared_by = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM advisors WHERE rol = 'admin'
    )
  );

-- Actualizar la función get_accessible_advisor_ids para incluir shares
-- (Nota: la función existente solo cubre subordinados directos)
CREATE OR REPLACE FUNCTION get_accessible_client_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE
AS $$
  -- Clientes propios
  SELECT id FROM clients WHERE asesor_id = auth.uid()
  UNION
  -- Clientes de subordinados
  SELECT id FROM clients WHERE asesor_id IN (
    SELECT id FROM advisors WHERE parent_advisor_id = auth.uid()
  )
  UNION
  -- Clientes compartidos conmigo
  SELECT client_id FROM client_advisors WHERE advisor_id = auth.uid()
  UNION
  -- Clientes huérfanos
  SELECT id FROM clients WHERE asesor_id IS NULL
$$;
