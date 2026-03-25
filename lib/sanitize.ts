// lib/sanitize.ts
// Utilidad compartida para sanitizar inputs

/**
 * Sanitiza un string para uso seguro en queries PostgreSQL ILIKE.
 * Escapa caracteres especiales (%, _, \) y limita longitud.
 */
export function sanitizeSearchInput(input: string, maxLength = 100): string {
  return input
    .slice(0, maxLength)
    .replace(/[%_\\]/g, "\\$&");
}

/**
 * Escapa caracteres especiales de HTML para prevenir XSS
 * cuando se interpola texto de usuario en templates HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
