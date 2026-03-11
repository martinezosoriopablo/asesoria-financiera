-- Script para agregar integración con Google Calendar
-- Ejecutar en Supabase SQL Editor

-- Tabla para almacenar tokens de Google Calendar por asesor
CREATE TABLE IF NOT EXISTS advisor_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT DEFAULT 'primary', -- ID del calendario a usar
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(advisor_id)
);

-- Índice para búsqueda rápida por advisor
CREATE INDEX IF NOT EXISTS idx_google_tokens_advisor ON advisor_google_tokens(advisor_id);

-- Agregar columna google_event_id a meetings para trackear eventos sincronizados
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Índice para búsqueda por google_event_id
CREATE INDEX IF NOT EXISTS idx_meetings_google_event ON meetings(google_event_id);

-- Comentarios para documentación
COMMENT ON TABLE advisor_google_tokens IS 'Tokens OAuth de Google Calendar por asesor';
COMMENT ON COLUMN advisor_google_tokens.calendar_id IS 'ID del calendario de Google a usar (primary = calendario principal)';
COMMENT ON COLUMN meetings.google_event_id IS 'ID del evento en Google Calendar para sincronización';

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_google_tokens_updated_at ON advisor_google_tokens;
CREATE TRIGGER trigger_google_tokens_updated_at
  BEFORE UPDATE ON advisor_google_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_google_tokens_updated_at();
