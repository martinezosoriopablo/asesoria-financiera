/**
 * Remove diacritical marks (accents) from a string.
 * Used for accent-insensitive search/comparison of Chilean fund names.
 */
export function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize text for comparison: lowercase + strip accents + trim.
 */
export function normalizeText(text: string): string {
  return stripAccents(text).toLowerCase().trim();
}
