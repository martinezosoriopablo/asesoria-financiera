export interface FeeInputs {
  advisory_fee_pct?: number | null;
  rebate_pct?: number | null;
}

// Ingreso anual recurrente estimado = (advisory_fee% + rebate%)/100 × base.
// La comisión de transacción NO entra (es por evento, no recurrente).
// Devuelve null si no hay base positiva o no hay ningún % configurado.
export function estimateAnnualRevenue(fees: FeeInputs, base: number | null | undefined): number | null {
  if (!base || base <= 0) return null;
  const adv = fees.advisory_fee_pct ?? 0;
  const reb = fees.rebate_pct ?? 0;
  if (adv <= 0 && reb <= 0) return null;
  return ((adv + reb) / 100) * base;
}
