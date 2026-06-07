-- Servicios adicionales del cliente: seguros, asesoría tributaria, asesoría inmobiliaria
-- Stored as JSONB with structure:
-- {
--   "seguros": { "activo": true, "poliza": "123456", "cobertura": "...", "beneficiarios": "...", "notas": "..." },
--   "asesoria_tributaria": { "activo": true, "descripcion": "..." },
--   "asesoria_inmobiliaria": { "activo": true, "descripcion": "..." }
-- }
ALTER TABLE clients ADD COLUMN IF NOT EXISTS servicios_adicionales jsonb DEFAULT NULL;
