-- Correo de contacto/notificaciones configurable por asesor (fallback a advisors.email).
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS contact_email text;
