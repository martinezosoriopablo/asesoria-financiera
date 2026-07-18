// lib/tax/apv.ts
// Cálculo del beneficio tributario APV (Régimen A y B).
// Fuente única: usa calcularImpuestoProgresivo (que divide/multiplica por 12
// correctamente) y las constantes canónicas de chilean-tax.ts.
// Todos los montos en UF. La UI convierte CLP<->UF fuera de este módulo.

import { calcularImpuestoProgresivo } from "./calculator";
import { APV_TOPE_ANUAL_UF, APV_CREDITO_REGIMEN_A } from "@/lib/constants/chilean-tax";

/** Tope de aporte deducible APV Régimen A: min(600 UF, 30% de la renta anual). */
export function calcularTopeAPV_A_UF(salarioAnualUF: number): number {
  return Math.min(APV_TOPE_ANUAL_UF, salarioAnualUF * 0.3);
}

/**
 * APV Régimen A: ahorro tributario = diferencia de Global Complementario
 * con y sin el aporte deducido de la base imponible.
 */
export function calcularAhorroAPV_A_UF(
  salarioAnualUF: number,
  aporteAnualUF: number
): { aporteElegibleUF: number; ahorroAnualUF: number; rentabilidadEquivalente: number } {
  const tope = calcularTopeAPV_A_UF(salarioAnualUF);
  const aporteElegibleUF = Math.min(aporteAnualUF, tope);

  const impuestoSinAPV = calcularImpuestoProgresivo(salarioAnualUF);
  const impuestoConAPV = calcularImpuestoProgresivo(salarioAnualUF - aporteElegibleUF);

  const ahorroAnualUF = impuestoSinAPV - impuestoConAPV;
  const rentabilidadEquivalente =
    aporteAnualUF > 0 ? (ahorroAnualUF / aporteAnualUF) * 100 : 0;

  return { aporteElegibleUF, ahorroAnualUF, rentabilidadEquivalente };
}

/**
 * APV Régimen B: crédito fiscal fijo (15%) sobre el aporte elegible,
 * topado en 600 UF anuales.
 */
export function calcularCreditoAPV_B_UF(
  aporteAnualUF: number
): { aporteElegibleUF: number; creditoAnualUF: number } {
  const aporteElegibleUF = Math.min(aporteAnualUF, APV_TOPE_ANUAL_UF);
  const creditoAnualUF = aporteElegibleUF * APV_CREDITO_REGIMEN_A;
  return { aporteElegibleUF, creditoAnualUF };
}
