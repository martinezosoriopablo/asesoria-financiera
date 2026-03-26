-- Fix: Add unique constraints needed for AAFM upsert operations
-- These constraints enable ON CONFLICT upsert instead of delete+insert

-- fondos_rentabilidades_agregadas: unique on (fondo_id, fecha_calculo, fuente)
-- First remove duplicates if any exist
DELETE FROM fondos_rentabilidades_agregadas a
USING fondos_rentabilidades_agregadas b
WHERE a.ctid < b.ctid
  AND a.fondo_id = b.fondo_id
  AND a.fecha_calculo = b.fecha_calculo
  AND a.fuente = b.fuente;

ALTER TABLE fondos_rentabilidades_agregadas
  ADD CONSTRAINT uq_rent_agregadas_fondo_fecha_fuente
  UNIQUE (fondo_id, fecha_calculo, fuente);

-- fondos_rentabilidades_diarias: ensure unique constraint exists
-- (may already exist from previous migration, IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_rent_diarias_fondo_fecha'
  ) THEN
    -- Remove duplicates first
    DELETE FROM fondos_rentabilidades_diarias a
    USING fondos_rentabilidades_diarias b
    WHERE a.ctid < b.ctid
      AND a.fondo_id = b.fondo_id
      AND a.fecha = b.fecha;

    ALTER TABLE fondos_rentabilidades_diarias
      ADD CONSTRAINT uq_rent_diarias_fondo_fecha
      UNIQUE (fondo_id, fecha);
  END IF;
END $$;
