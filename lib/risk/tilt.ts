// src/lib/risk/tilt.ts

// Nivel de tilt frente al benchmark
export type TiltLevel =
  | "underweight_strong"
  | "underweight"
  | "neutral"
  | "overweight"
  | "overweight_strong";

// Información completa de un tilt
// diff se expresa en puntos porcentuales: modelo - neutral
export interface TiltInfo {
  level: TiltLevel;
  diff: number; // ej: +3.5 significa modelo 3,5 pp sobre el benchmark
  description?: string;
}

/**
 * Clasifica el tilt en función de los pesos del benchmark y del modelo.
 *
 * IMPORTANTE:
 * - neutralWeight y modelWeight se expresan en % (ej: 15.0, 27.5)
 * - diff = modelWeight - neutralWeight, en puntos porcentuales
 *
 * Regla acordada:
 *  |diff| < 2      => Neutral
 *  2 <= |diff| < 5 => Overweight / Underweight
 *  |diff| >= 5     => Strong Overweight / Strong Underweight
 */
export function classifyTilt(
  neutralWeight: number,
  modelWeight: number
): TiltInfo {
  const diff = (modelWeight ?? 0) - (neutralWeight ?? 0);
  const abs = Math.abs(diff);

  if (abs < 0.2) {
    return {
      level: "neutral",
      diff,
      description: "Neutral (±0–0.2 pp vs. benchmark)",
    };
  }

  if (abs < 3) {
    if (diff > 0) {
      return {
        level: "overweight",
        diff,
        description: "Overweight (+0.2–3 pp sobre el benchmark)",
      };
    }
    return {
      level: "underweight",
      diff,
      description: "Underweight (−0.2–3 pp bajo el benchmark)",
    };
  }

  // abs >= 3 => strong
  if (diff > 0) {
    return {
      level: "overweight_strong",
      diff,
      description: "Strong Overweight (≥ +3 pp sobre el benchmark)",
    };
  }

  return {
    level: "underweight_strong",
    diff,
    description: "Strong Underweight (≤ −3 pp bajo el benchmark)",
  };
}

/**
 * Etiqueta corta para mostrar en badges / tablas
 * (Usada en TiltBadge como tiltLabel(tilt.level))
 */
export function tiltLabel(level: TiltLevel): string {
  switch (level) {
    case "neutral":
      return "Neutral";
    case "overweight":
      return "Overweight";
    case "overweight_strong":
      return "Strong Overweight";
    case "underweight":
      return "Underweight";
    case "underweight_strong":
      return "Strong Underweight";
    default:
      return "Neutral";
  }
}

