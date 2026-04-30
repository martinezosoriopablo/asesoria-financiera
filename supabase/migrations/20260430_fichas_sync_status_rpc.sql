-- RPC function to get fichas sync status per AGF (Fondos Mutuos)
CREATE OR REPLACE FUNCTION get_fichas_sync_status()
RETURNS TABLE(nombre_agf text, total bigint, synced bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    v.nombre_agf,
    COUNT(DISTINCT v.fo_run) as total,
    COUNT(DISTINCT ff.fo_run) as synced
  FROM vw_fondos_completo v
  LEFT JOIN fund_fichas ff ON ff.fo_run = v.fo_run
  WHERE v.nombre_agf IS NOT NULL
  GROUP BY v.nombre_agf
  ORDER BY total DESC;
$$;

-- RPC function to get fichas sync status per administradora (Fondos de Inversion)
CREATE OR REPLACE FUNCTION get_fi_fichas_sync_status()
RETURNS TABLE(administradora text, total bigint, synced bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    fi.administradora,
    COUNT(DISTINCT fi.rut) as total,
    COUNT(DISTINCT ff.fi_rut) as synced
  FROM fondos_inversion fi
  LEFT JOIN fi_fichas ff ON ff.fi_rut = fi.rut
  WHERE fi.activo = true AND fi.administradora IS NOT NULL
  GROUP BY fi.administradora
  ORDER BY total DESC;
$$;
