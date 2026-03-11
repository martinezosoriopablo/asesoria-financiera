-- Script para agregar campo fecha_nacimiento a clientes y linkedin_url a asesores
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar campo fecha_nacimiento a la tabla clients
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

-- 2. Agregar campo linkedin_url a la tabla advisors
ALTER TABLE advisors
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- Comentarios para documentación
COMMENT ON COLUMN clients.fecha_nacimiento IS 'Fecha de nacimiento del cliente';
COMMENT ON COLUMN advisors.linkedin_url IS 'URL del perfil de LinkedIn del asesor';
