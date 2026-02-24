-- Migración: Crear tabla para reportes del comité de inversiones
-- Ejecutar en Supabase SQL Editor

-- Crear tabla de reportes del comité
CREATE TABLE IF NOT EXISTS comite_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL UNIQUE, -- 'macro', 'rv', 'rf', 'asset_allocation'
    filename VARCHAR(255),
    title VARCHAR(500),
    content TEXT NOT NULL, -- Contenido HTML completo
    report_date DATE, -- Fecha del reporte
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraint para tipos válidos
    CONSTRAINT valid_report_type CHECK (type IN ('macro', 'rv', 'rf', 'asset_allocation'))
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_comite_reports_type ON comite_reports(type);
CREATE INDEX IF NOT EXISTS idx_comite_reports_date ON comite_reports(report_date DESC);

-- RLS (Row Level Security)
ALTER TABLE comite_reports ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden leer todos los reportes
CREATE POLICY "Usuarios autenticados pueden leer reportes"
ON comite_reports FOR SELECT
TO authenticated
USING (true);

-- Política: Los usuarios autenticados pueden insertar/actualizar reportes
CREATE POLICY "Usuarios autenticados pueden crear reportes"
ON comite_reports FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar reportes"
ON comite_reports FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Comentarios
COMMENT ON TABLE comite_reports IS 'Reportes del comité de inversiones (Macro, RV, RF, Asset Allocation)';
COMMENT ON COLUMN comite_reports.type IS 'Tipo de reporte: macro, rv, rf, asset_allocation';
COMMENT ON COLUMN comite_reports.content IS 'Contenido HTML completo del reporte';
