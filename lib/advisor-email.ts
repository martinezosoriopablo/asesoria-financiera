// Correo de contacto del asesor para emails salientes (reply-to / destinatario de notificaciones).
// Usa contact_email si está configurado; si no, cae al email de login.
export function advisorContactEmail(a: { contact_email?: string | null; email?: string | null } | null | undefined): string | null {
  if (!a) return null;
  return a.contact_email || a.email || null;
}
