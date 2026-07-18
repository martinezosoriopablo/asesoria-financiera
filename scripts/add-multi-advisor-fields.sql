-- ============================================================
-- SCRIPT: Agregar campos para sistema multi-asesor
-- ============================================================
-- La tabla ya tiene: rol, activo - usaremos esos
-- Solo necesitamos agregar: logo_url, company_name, parent_advisor_id

-- 1. Agregar campo logo_url para personalización
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Agregar campo company_name (nombre de la empresa/marca)
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS company_name TEXT;

-- 3. Agregar campo parent_advisor_id para jerarquía
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS parent_advisor_id UUID REFERENCES advisors(id) ON DELETE SET NULL;

-- 4. Crear índice para búsqueda por parent_advisor_id
CREATE INDEX IF NOT EXISTS idx_advisors_parent ON advisors(parent_advisor_id);

-- 5. Actualizar advisor principal como admin con logo
-- NOTA: Ajustar email según el admin real del sistema
UPDATE advisors
SET rol = 'admin',
    company_name = 'Global Advisors',
    logo_url = '/images/global2.jpeg'
WHERE email = current_setting('app.admin_email', true);

-- Verificar cambios
SELECT id, email, nombre, apellido, rol, company_name, logo_url, parent_advisor_id, activo
FROM advisors;
