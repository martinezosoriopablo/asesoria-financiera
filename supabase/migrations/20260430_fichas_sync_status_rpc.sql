-- RPC function to get fichas sync status per AGF
-- Does the JOIN in SQL to avoid JavaScript type comparison issues
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
