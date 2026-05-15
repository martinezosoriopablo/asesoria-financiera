// lib/constants/chilean-tax.ts
// Chilean tax constants for the custody change optimizer

// Tramos impuesto global complementario (UF mensuales)
export const TRAMOS_IMPUESTO = [
  { desde: 0, hasta: 13.5, tasa: 0 },
  { desde: 13.5, hasta: 30, tasa: 0.04 },
  { desde: 30, hasta: 50, tasa: 0.08 },
  { desde: 50, hasta: 70, tasa: 0.135 },
  { desde: 70, hasta: 90, tasa: 0.23 },
  { desde: 90, hasta: 120, tasa: 0.304 },
  { desde: 120, hasta: 310, tasa: 0.355 },
  { desde: 310, hasta: Infinity, tasa: 0.40 },
] as const;

// Franquicias tributarias
export const APV_TOPE_ANUAL_UF = 600;
export const DC_TOPE_ANUAL_UF = 900;
export const APV_CREDITO_REGIMEN_A = 0.15;
export const APV_A_TOPE_MENSUAL_UTM = 6;
export const ART107_TASA_UNICA = 0.10;
export const ART104_TASA_UNICA = 0.04;
export const EXENCION_NO_HABITUAL_UTA = 10;
export const EXENCION_RENTAS_CAPITAL_UTM = 30;

// Rentabilidades esperadas reales por clase de activo (en UF, configurables)
export const RENTABILIDAD_ESPERADA_REAL: Record<string, number> = {
  "Renta Variable Nacional": 0.08,
  "Renta Variable Internacional": 0.07,
  "Renta Fija Nacional": 0.03,
  "Renta Fija Internacional": 0.025,
  "Balanceado": 0.05,
  "Alternativos": 0.06,
  "Otros": 0.03,
};
