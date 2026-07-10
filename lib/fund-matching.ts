// lib/fund-matching.ts
// Shared fund name-matching utilities used across API routes.
// Extracts the common tokenize → search → score → pick-best pattern.

import { stripAccents } from "@/lib/text";
import { detectSerieCode } from "@/lib/fund-utils";

const STOPWORDS = /^(fondo|mutuo|inversion|de|del|la|los|las|el|en|con|por|serie?|tipo|inv|para)$/i;

// Serie alias mapping (BCI convention: BANCA PRIVADA→BPRIV, ALTO PATRIMONIO→ALPAT, etc.)
export const SERIE_ALIASES: Record<string, string[]> = {
  BANCA: ["BPRIV", "BP"],
  ALTO: ["ALPAT", "ALTOP", "AP"],
  CLASICA: ["CLASI"],
  FAMILIAR: ["FAMIL"],
  INSTITUCIONAL: ["INSTI"],
  COLABORADOR: ["COLAB"],
};

/**
 * Tokenize a fund name for matching: normalize, strip serie suffix, filter stopwords.
 * Returns tokens sorted by length descending (most distinctive first).
 */
export function tokenizeFundName(
  fundName: string,
  opts?: { minLength?: number }
): { tokens: string[]; detectedSerie: string | null } {
  const detectedSerie = detectSerieCode(fundName);

  // Strip the serie suffix before tokenizing
  let cleanName = fundName;
  if (detectedSerie) {
    const serieIdx = cleanName.search(/\bSERIE?\b/i);
    if (serieIdx > 0) cleanName = cleanName.slice(0, serieIdx).trim();
  }

  const minLen = opts?.minLength ?? 3;
  const nameNorm = stripAccents(cleanName.toLowerCase());
  const tokens = nameNorm
    .split(/\s+/)
    .filter((w) => w.length >= minLen && !STOPWORDS.test(w))
    .sort((a, b) => b.length - a.length);

  return { tokens, detectedSerie };
}

/**
 * Score a candidate fund name against search tokens + optional serie.
 * Returns a numeric score (higher = better match).
 */
export function scoreFundMatch(
  candidateName: string,
  candidateSerie: string | undefined | null,
  tokens: string[],
  targetSerie: string | null
): number {
  const norm = stripAccents(candidateName.toLowerCase());
  let score = 0;

  for (const w of tokens) {
    if (norm.includes(w)) score++;
  }

  if (targetSerie && candidateSerie) {
    const dbSerie = candidateSerie.toUpperCase();
    if (dbSerie === targetSerie) {
      score += 5;
    } else if (SERIE_ALIASES[targetSerie]?.includes(dbSerie)) {
      score += 5;
    } else {
      score -= 1;
    }
  }

  return score;
}

/**
 * Pick the best-scoring match from an array of candidates.
 * Returns the best candidate + score, or null if below minScore.
 */
export function pickBestMatch<T extends { nombre_fondo?: string; name?: string }>(
  candidates: T[],
  tokens: string[],
  targetSerie: string | null,
  opts?: {
    minScore?: number;
    getSerie?: (c: T) => string | null;
    getName?: (c: T) => string;
  }
): { match: T; score: number } | null {
  const minScore = opts?.minScore ?? 2;
  const getName = opts?.getName ?? ((c: T) => (c.nombre_fondo || c.name || "") as string);
  const getSerie = opts?.getSerie ?? (() => null);

  let best: T | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    const s = scoreFundMatch(getName(c), getSerie(c), tokens, targetSerie);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  if (!best || bestScore < minScore) return null;
  return { match: best, score: bestScore };
}
