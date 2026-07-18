// lib/seguimiento/monthly-return.ts
// Retorno mensual del portafolio calculado por VALOR CUOTA (precio), ponderado
// por el % de cada activo al inicio del mes. Diseñado para no distorsionarse con
// aportes/retiros: comprar o vender no es retorno, es flujo de caja.
//
// - Retorno por holding tenido en ambas fechas = valorCuotaFin/valorCuotaIni − 1
//   (usa marketValue/quantity, así un cambio de cantidad no afecta el %).
// - Entrantes/salientes a mitad de mes: usan un retorno externo si se conoce
//   (holdingReturnsData); si no, quedan fuera del retorno (su monto es flujo).
// - Peso por holding = valorInicio / valorTotalInicio (incluye caja, que rinde 0).
// - Flujo de caja neto = ΔValorTotal − cambio explicado por retorno.

export type AssetClassKey = "equity" | "fixedIncome" | "alternatives";

export interface MonthlyHoldingInput {
  name: string;
  assetClass: AssetClassKey;
  assetType?: string;
  startCLP: number;
  startQty: number;
  endCLP: number;
  endQty: number;
  /** Retorno % para entrantes/salientes cuyo valor cuota no es derivable de las 2 cartolas. */
  externalReturnPct?: number | null;
}

export interface MonthlyHoldingResult {
  name: string;
  assetClass: AssetClassKey;
  assetType: string;
  returnPct: number | null;
  startCLP: number;
  endCLP: number;
  weightPct: number;
  contributionPp: number;
  status: "held" | "new" | "sold";
}

export interface MonthlyReturnResult {
  holdings: MonthlyHoldingResult[];
  byClass: Record<AssetClassKey, { initial: number; final: number; returnPct: number }>;
  portfolioReturnPct: number;
  netCashFlowCLP: number;
  totalStartCLP: number;
  totalEndCLP: number;
}

/** Retorno por valor cuota (precio) cuando el holding se tiene en ambas fechas. */
function unitReturnPct(startCLP: number, startQty: number, endCLP: number, endQty: number): number | null {
  if (startQty > 0 && endQty > 0 && startCLP > 0) {
    const startUnit = startCLP / startQty;
    const endUnit = endCLP / endQty;
    if (startUnit > 0) return (endUnit / startUnit - 1) * 100;
  }
  return null;
}

export function computeMonthlyReturn(
  holdings: MonthlyHoldingInput[],
  cashStart: number,
  cashEnd: number,
): MonthlyReturnResult {
  const enriched = holdings.map((h) => {
    const isNew = h.startQty === 0 && h.endQty > 0;
    const isSold = h.startQty > 0 && h.endQty === 0;
    const status: MonthlyHoldingResult["status"] = isNew ? "new" : isSold ? "sold" : "held";
    const returnPct = status === "held"
      ? unitReturnPct(h.startCLP, h.startQty, h.endCLP, h.endQty)
      : (h.externalReturnPct ?? null);
    return { ...h, status, returnPct };
  });

  const holdingsStart = holdings.reduce((s, h) => s + h.startCLP, 0);
  const holdingsEnd = holdings.reduce((s, h) => s + h.endCLP, 0);
  const totalStartCLP = holdingsStart + cashStart;
  const totalEndCLP = holdingsEnd + cashEnd;

  // Peso por valor al inicio (incluye caja implícitamente vía totalStartCLP).
  const weightBase = totalStartCLP > 0 ? totalStartCLP : 0;

  const results: MonthlyHoldingResult[] = enriched.map((h) => {
    // Solo pondera lo que estuvo al inicio y tiene retorno conocido.
    const contributes = h.startCLP > 0 && h.returnPct != null;
    const weight = weightBase > 0 && contributes ? h.startCLP / weightBase : 0;
    const contributionPp = contributes ? h.returnPct! * weight : 0;
    return {
      name: h.name,
      assetClass: h.assetClass,
      assetType: h.assetType ?? "fund",
      returnPct: h.returnPct,
      startCLP: h.startCLP,
      endCLP: h.endCLP,
      weightPct: weight * 100,
      contributionPp,
      status: h.status,
    };
  });

  const portfolioReturnPct = results.reduce((s, h) => s + h.contributionPp, 0);

  // Cambio explicado por retorno (solo lo tenido al inicio con retorno conocido).
  const returnDriven = enriched.reduce(
    (s, h) => (h.startCLP > 0 && h.returnPct != null ? s + h.startCLP * (h.returnPct / 100) : s),
    0,
  );
  const netCashFlowCLP = (totalEndCLP - totalStartCLP) - returnDriven;

  const classKeys: AssetClassKey[] = ["equity", "fixedIncome", "alternatives"];
  const byClass = {} as MonthlyReturnResult["byClass"];
  for (const k of classKeys) {
    const inClass = enriched.filter((h) => h.assetClass === k);
    const initial = inClass.reduce((s, h) => s + h.startCLP, 0);
    const final = inClass.reduce((s, h) => s + h.endCLP, 0);
    const base = inClass.reduce((s, h) => (h.startCLP > 0 && h.returnPct != null ? s + h.startCLP : s), 0);
    const returnPct = base > 0
      ? inClass.reduce((s, h) => (h.startCLP > 0 && h.returnPct != null ? s + h.returnPct * (h.startCLP / base) : s), 0)
      : 0;
    byClass[k] = { initial, final, returnPct };
  }

  return { holdings: results, byClass, portfolioReturnPct, netCashFlowCLP, totalStartCLP, totalEndCLP };
}
