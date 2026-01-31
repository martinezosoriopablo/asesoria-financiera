export interface LifeExpectancyInput {
  sexo: "masculino" | "femenino";
  edadActual: number;
  fuma: boolean;
  salud: "excelente" | "buena" | "regular" | "mala";
}

export interface RetirementProjection {
  esperanzaVida: number;
  aniosRetiro: number;
  aniosParaAhorrar: number;
  capitalEstimado: number;
}

// Tablas TM-2020 chilenas (simplificadas)
// Base: Hombre 65 → 86.6 años, Mujer 60 → 90.8 años
const BASE_LIFE_EXPECTANCY: Record<string, number> = {
  masculino: 86.6,
  femenino: 90.8,
};

const SALUD_ADJUSTMENT: Record<string, number> = {
  excelente: 2,
  buena: 0,
  regular: -1,
  mala: -2,
};

export function estimateLifeExpectancy(input: LifeExpectancyInput): number {
  let base = BASE_LIFE_EXPECTANCY[input.sexo];

  if (input.fuma) base -= 3;
  base += SALUD_ADJUSTMENT[input.salud];

  // Ensure life expectancy is at least current age + 1
  return Math.max(base, input.edadActual + 1);
}

export function calculateRetirementProjection(
  input: LifeExpectancyInput,
  edadJubilacion: number,
  pensionDeseada: number
): RetirementProjection {
  const esperanzaVida = estimateLifeExpectancy(input);
  const aniosRetiro = Math.max(0, esperanzaVida - edadJubilacion);
  const aniosParaAhorrar = Math.max(0, edadJubilacion - input.edadActual);
  const capitalEstimado = pensionDeseada * 12 * aniosRetiro;

  return {
    esperanzaVida: Math.round(esperanzaVida * 10) / 10,
    aniosRetiro: Math.round(aniosRetiro * 10) / 10,
    aniosParaAhorrar,
    capitalEstimado: Math.round(capitalEstimado),
  };
}
