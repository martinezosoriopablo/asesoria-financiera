// lib/sanitize.ts
// Utilidad compartida para sanitizar inputs de búsqueda en queries ILIKE

/**
 * Sanitiza un string para uso seguro en queries PostgreSQL ILIKE.
 * Escapa caracteres especiales (%, _, \) y limita longitud.
 */
export function sanitizeSearchInput(input: string, maxLength = 100): string {
  return input
    .slice(0, maxLength)
    .replace(/[%_\\]/g, "\\$&");
}
