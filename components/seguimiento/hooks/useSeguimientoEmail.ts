"use client";

import { useState, useCallback } from "react";
import type { SeguimientoEmailData } from "@/lib/seguimiento-email";
import { proratePeriodReturn } from "@/lib/bonds/prorate-period-return";
import { computeMonthlyReturn, type MonthlyHoldingInput, type AssetClassKey } from "@/lib/seguimiento/monthly-return";
import type { HoldingReturnsData } from "../HoldingReturnsPanel";

interface Metrics {
  totalReturn: number;
  currentValue: number;
  initialValue: number;
  composition: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

interface Client {
  nombre: string;
  apellido: string;
  perfil_riesgo?: string;
}

interface EmailSnapshot {
  snapshot_date: string;
  cash_value: number;
  total_value: number;
  equity_value?: number;
  fixed_income_value?: number;
  alternatives_value?: number;
  holdings?: unknown[] | null;
  source?: string;
}

interface SnapHolding {
  fundName: string;
  securityId?: string;
  serie?: string;
  marketValue: number;
  marketValueCLP?: number;
  marketPrice?: number;
  quantity?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  market?: string;
}

interface UseSeguimientoEmailProps {
  clientId: string;
  data: { client: Client; metrics: Metrics | null; snapshots?: EmailSnapshot[] } | null;
  holdingReturnsData: HoldingReturnsData | null;
  periodReturns: Record<string, { nominal: number; real: number | null; usd: number | null } | null> | null;
  benchmarkReturns: Record<string, number> | null;
  benchmarkLabel: string;
  currentExchangeRates: { uf: number; usd: number } | null;
  exchangeRates: { uf: number; usd: number } | null;
  livePortfolioValue: number | null;
  displayCurrency: string;
  accumulatedReturn: number | null;
  fxRateAt?: (currency: string, date: string) => number; // FX (CLP por unidad) por fecha
}

// ---------- Monthly computation helper ----------

interface MonthlyResult {
  comp: SeguimientoEmailData["composition"];
  holdingRets: SeguimientoEmailData["holdingReturns"];
  attrList: SeguimientoEmailData["attribution"];
  returnsBasis: { fromDate: string; toDate: string };
  fromISO: string; // fecha ISO de inicio del período (para tasa FX)
  toISO: string;   // fecha ISO de fin del período (para tasa FX)
  monthTotalValue: number;
  netCashFlowCLP?: number;
  monthlyReturnPct?: number;
}

function computeMonthlyData(
  reportMonth: string,
  snapshots: EmailSnapshot[],
  holdingReturnsData: HoldingReturnsData | null,
): MonthlyResult | null {
  const [y, m] = reportMonth.split("-").map(Number);
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;

  // All cartola snapshots (not api-prices), sorted chronologically
  const cartolas = snapshots
    .filter(s => s.source !== "api-prices")
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  if (cartolas.length < 2) return null;

  // End snap: nearest cartola on or before monthEnd
  let endSnap: EmailSnapshot | null = null;
  for (const s of cartolas) {
    if (s.snapshot_date <= monthEnd) endSnap = s;
    else break;
  }
  if (!endSnap) return null;

  // Start snap: ideally the cartola just BEFORE monthStart (end of previous month)
  // If not available, use the cartola just before endSnap
  const beforeMonth = cartolas.filter(s => s.snapshot_date < monthStart);
  let startSnap: EmailSnapshot | null = null;
  if (beforeMonth.length > 0) {
    startSnap = beforeMonth[beforeMonth.length - 1]; // latest before month start
  } else {
    // No cartola before the month — use the one just before endSnap
    const endIdx = cartolas.indexOf(endSnap);
    startSnap = endIdx > 0 ? cartolas[endIdx - 1] : null;
  }

  if (!startSnap || startSnap.snapshot_date === endSnap.snapshot_date) return null;

  // Check if both snapshots have holdings for per-holding detail
  const startHasHoldings = startSnap.holdings && Array.isArray(startSnap.holdings) && (startSnap.holdings as unknown[]).length > 0;
  const endHasHoldings = endSnap.holdings && Array.isArray(endSnap.holdings) && (endSnap.holdings as unknown[]).length > 0;

  if (startHasHoldings && endHasHoldings && holdingReturnsData) {
    // Full per-holding monthly computation
    return computeMonthlyDataWithSnaps(startSnap, endSnap, holdingReturnsData);
  }

  // Fallback: use class-level values from snapshot columns (no per-holding detail)
  return computeMonthlyFromClassValues(startSnap, endSnap);
}

/** Fallback when snapshots don't have holdings arrays — uses class-level DB columns */
function computeMonthlyFromClassValues(
  startSnap: EmailSnapshot,
  endSnap: EmailSnapshot,
): MonthlyResult {
  const eqStart = startSnap.equity_value || 0;
  const eqEnd = endSnap.equity_value || 0;
  const fiStart = startSnap.fixed_income_value || 0;
  const fiEnd = endSnap.fixed_income_value || 0;
  const altStart = startSnap.alternatives_value || 0;
  const altEnd = endSnap.alternatives_value || 0;
  const cashStart = startSnap.cash_value || 0;
  const cashEnd = endSnap.cash_value || 0;

  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

  return {
    comp: {
      equity: { initial: eqStart, final: eqEnd, returnPct: eqStart > 0 ? ((eqEnd / eqStart) - 1) * 100 : 0 },
      fixedIncome: { initial: fiStart, final: fiEnd, returnPct: fiStart > 0 ? ((fiEnd / fiStart) - 1) * 100 : 0 },
      alternatives: { initial: altStart, final: altEnd, returnPct: altStart > 0 ? ((altEnd / altStart) - 1) * 100 : 0 },
      cash: { initial: cashStart, final: cashEnd, returnPct: 0 },
    },
    holdingRets: [], // No per-holding detail without holdings arrays
    attrList: [],
    returnsBasis: { fromDate: fmtDate(startSnap.snapshot_date), toDate: fmtDate(endSnap.snapshot_date) },
    fromISO: startSnap.snapshot_date,
    toISO: endSnap.snapshot_date,
    monthTotalValue: endSnap.total_value,
  };
}

function computeMonthlyDataWithSnaps(
  startSnap: EmailSnapshot,
  endSnap: EmailSnapshot,
  holdingReturnsData: HoldingReturnsData,
): MonthlyResult {
  // Mapas {clp, qty} por holding (qty para calcular valor cuota = clp/qty)
  const buildMap = (snap: EmailSnapshot): Map<string, { clp: number; qty: number }> => {
    const map = new Map<string, { clp: number; qty: number }>();
    for (const h of (snap.holdings as SnapHolding[])) {
      if (!h.fundName) continue;
      const clp = (h.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h.marketValue || 0);
      const prev = map.get(h.fundName) || { clp: 0, qty: 0 };
      prev.clp += clp;
      prev.qty += h.quantity || 0;
      map.set(h.fundName, prev);
    }
    return map;
  };
  const startMap = buildMap(startSnap);
  const endMap = buildMap(endSnap);

  // Clasificación + tipo + retorno externo (para entrantes/salientes) desde holdingReturnsData
  const classOf = new Map<string, AssetClassKey>();
  const typeOf = new Map<string, string>();
  const externalRet = new Map<string, number>();
  const register = (
    arr: ReadonlyArray<{ fundName: string; totalReturn?: number; assetType?: string }> | undefined,
    cls: AssetClassKey,
    typeDefault: string,
  ) => {
    for (const h of (arr || [])) {
      classOf.set(h.fundName, cls);
      typeOf.set(h.fundName, h.assetType || typeDefault);
      if (typeof h.totalReturn === "number") externalRet.set(h.fundName, h.totalReturn);
    }
  };
  register(holdingReturnsData.equityHoldings, "equity", "fund");
  register(holdingReturnsData.fixedIncomeFundHoldings, "fixedIncome", "fund");
  register(holdingReturnsData.bondHoldings, "fixedIncome", "bond");
  register(holdingReturnsData.alternativesHoldings, "alternatives", "fund");

  // Construir inputs para el cálculo por valor cuota
  const allNames = Array.from(new Set([...Array.from(startMap.keys()), ...Array.from(endMap.keys())]));
  const inputs: MonthlyHoldingInput[] = [];
  for (const name of allNames) {
    const s = startMap.get(name) || { clp: 0, qty: 0 };
    const e = endMap.get(name) || { clp: 0, qty: 0 };
    if (s.clp === 0 && e.clp === 0) continue;

    let cls = classOf.get(name);
    if (!cls) {
      // No está en holdingReturnsData: usar assetClass del snapshot
      const endH = (endSnap.holdings as SnapHolding[]).find(h => h.fundName === name);
      const ac = (endH?.assetClass || "").toLowerCase();
      cls = (ac.includes("fixed") || ac.includes("fija")) ? "fixedIncome"
        : ac.includes("alter") ? "alternatives"
        : "equity";
    }
    inputs.push({
      name,
      assetClass: cls,
      assetType: typeOf.get(name) || "Otro",
      startCLP: s.clp, startQty: s.qty,
      endCLP: e.clp, endQty: e.qty,
      externalReturnPct: externalRet.has(name) ? externalRet.get(name)! : null,
    });
  }

  const cashStart = startSnap.cash_value || 0;
  const cashEnd = endSnap.cash_value || 0;

  const result = computeMonthlyReturn(inputs, cashStart, cashEnd);

  const comp: SeguimientoEmailData["composition"] = {
    equity: result.byClass.equity,
    fixedIncome: result.byClass.fixedIncome,
    alternatives: result.byClass.alternatives,
    cash: { initial: cashStart, final: cashEnd, returnPct: 0 },
  };

  // Retorno por posición (solo las que tienen retorno conocido)
  const holdingRets = result.holdings
    .filter(h => h.returnPct != null)
    .map(h => ({ name: h.name, assetType: h.assetType, returnPct: h.returnPct as number }))
    .sort((a, b) => b.returnPct - a.returnPct)
    .slice(0, 20);

  // Atribución = contribución por valor cuota × peso (compras/ventas no inflan)
  const rawAttr = result.holdings
    .filter(h => h.contributionPp !== 0)
    .map(h => ({ name: h.name, instrumentType: h.assetType, contributionPp: h.contributionPp }))
    .sort((a, b) => b.contributionPp - a.contributionPp);
  const positives = rawAttr.filter(a => a.contributionPp >= 0);
  const negatives = rawAttr.filter(a => a.contributionPp < 0);
  const attrList = [...positives.slice(0, 10), ...negatives.slice(0, 10)];

  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

  return {
    comp,
    holdingRets,
    attrList,
    returnsBasis: { fromDate: fmtDate(startSnap.snapshot_date), toDate: fmtDate(endSnap.snapshot_date) },
    fromISO: startSnap.snapshot_date,
    toISO: endSnap.snapshot_date,
    monthTotalValue: endSnap.total_value,
    netCashFlowCLP: result.netCashFlowCLP,
    monthlyReturnPct: result.portfolioReturnPct,
  };
}

// ---------- API-based monthly computation (for clients with < 2 cartolas) ----------

interface PriceAtDateResult {
  fundName: string;
  assetClass?: string;
  startPrice: number | null;
  endPrice: number | null;
  returnPct: number | null;
  synthetic?: boolean;
}

async function fetchMonthlyFromAPI(
  reportMonth: string,
  snapshots: EmailSnapshot[],
  holdingReturnsData: HoldingReturnsData,
  fxRateAt?: (currency: string, date: string) => number,
): Promise<MonthlyResult | null> {
  // FX (CLP por unidad de moneda) a una fecha; 1 si no hay data.
  const fxAt = (ccy: string, date: string): number => {
    const c = (ccy || "CLP").toUpperCase();
    if (c === "CLP") return 1;
    return (fxRateAt && fxRateAt(c, date)) || 1;
  };
  const [y, m] = reportMonth.split("-").map(Number);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const endDate = isCurrentMonth ? now.toISOString().split("T")[0] : monthEnd;

  // Find the best cartola for holdings composition
  const cartolas = snapshots
    .filter(s => s.source !== "api-prices" && Array.isArray(s.holdings) && (s.holdings as unknown[]).length > 0)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  if (cartolas.length === 0) return null;

  // Nearest cartola to the month
  let snap = cartolas[0];
  for (const s of cartolas) {
    if (s.snapshot_date <= monthEnd) snap = s;
  }

  const holdings = snap.holdings as SnapHolding[];

  try {
    const res = await fetch("/api/portfolio/prices-at-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map(h => ({
          fundName: h.fundName,
          securityId: h.securityId || null,
          serie: h.serie || null,
          assetClass: h.assetClass,
          currency: h.currency || null,
          market: h.market || null,
          cartolaPrice: (h.quantity && h.quantity > 0 ? h.marketValue / h.quantity : null) || h.marketPrice || null,
        })),
        startDate,
        endDate,
      }),
    });
    const data = await res.json();
    if (!data.success || !data.results) return null;

    const results = data.results as PriceAtDateResult[];

    // Classify holdings using holdingReturnsData
    const classOf = new Map<string, "equity" | "fixedIncome" | "alternatives">();
    const typeOf = new Map<string, string>();
    for (const h of holdingReturnsData.equityHoldings) { classOf.set(h.fundName, "equity"); typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund"); }
    for (const h of holdingReturnsData.fixedIncomeFundHoldings) { classOf.set(h.fundName, "fixedIncome"); typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund"); }
    for (const h of holdingReturnsData.bondHoldings) { classOf.set(h.fundName, "fixedIncome"); typeOf.set(h.fundName, "bond"); }
    for (const h of (holdingReturnsData.alternativesHoldings || [])) { classOf.set(h.fundName, "alternatives"); typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund"); }

    // Valores CLP REALES por clase: inicial = qty×precio_inicio×TC(inicio),
    // final = qty×precio_fin×TC(fin). Así el retorno CLP incluye el FX real del mes
    // (no se fabrica el final a la tasa de inicio). Fallback a CLP del snapshot si
    // falta cantidad/precio.
    let totalWeight = 0;
    let eqInit = 0, eqFin = 0, fiInit = 0, fiFin = 0, altInit = 0, altFin = 0;

    const holdingRets: SeguimientoEmailData["holdingReturns"] = [];
    const attrRaw: Array<{ name: string; instrumentType: string; weight: number; returnPct: number }> = [];

    const coveredNames = new Set<string>();
    for (const r of results) {
      if (r.returnPct === null) continue;
      coveredNames.add(r.fundName);
      const h = holdings.find(hh => hh.fundName === r.fundName);
      const weight = (h?.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h?.marketValue || 0);
      if (weight <= 0) continue;
      const qty = h?.quantity || 0;
      const ccy = h?.currency || "USD";
      const initCLP = (qty > 0 && r.startPrice != null) ? qty * r.startPrice * fxAt(ccy, startDate) : weight;
      const finCLP = (qty > 0 && r.endPrice != null) ? qty * r.endPrice * fxAt(ccy, endDate) : initCLP * (1 + r.returnPct / 100);
      // Retorno CLP real (incluye FX del mes); el hook lo re-basa a la moneda del cliente.
      const clpRet = initCLP > 0 ? ((finCLP / initCLP) - 1) * 100 : r.returnPct;

      totalWeight += weight;
      const cls = classOf.get(r.fundName);
      if (cls === "fixedIncome") { fiInit += initCLP; fiFin += finCLP; }
      else if (cls === "alternatives") { altInit += initCLP; altFin += finCLP; }
      else { eqInit += initCLP; eqFin += finCLP; }

      holdingRets.push({ name: r.fundName, assetType: typeOf.get(r.fundName) || "Otro", returnPct: clpRet });
      attrRaw.push({ name: r.fundName, instrumentType: typeOf.get(r.fundName) || "Otro", weight, returnPct: clpRet });
    }

    // Bonds return null from prices-at-date (no FINRA historical handler).
    // Inject bond returns prorated linearly for the report month.
    const cartolaDate = snap.snapshot_date;
    for (const b of holdingReturnsData.bondHoldings) {
      if (coveredNames.has(b.fundName)) continue;
      const ret = proratePeriodReturn({
        accumulatedReturnPct: b.totalReturn ?? 0,
        cartolaDate,
        referenceDateMs: Date.now(),
        periodStart: startDate,
        periodEnd: endDate,
      });
      const weight = b.marketValue || 0;
      if (weight <= 0) continue;

      totalWeight += weight;
      fiInit += weight;
      fiFin += weight * (1 + ret / 100);
      holdingRets.push({ name: b.fundName, assetType: "bond", returnPct: ret });
      attrRaw.push({ name: b.fundName, instrumentType: "bond", weight, returnPct: ret });
    }

    if (totalWeight <= 0) return null;

    holdingRets.sort((a, b) => b.returnPct - a.returnPct);

    // Attribution: contribution = returnPct × (weight / totalWeight)
    const attrList: SeguimientoEmailData["attribution"] = attrRaw
      .map(a => ({
        name: a.name,
        instrumentType: a.instrumentType,
        contributionPp: (a.returnPct / 100) * (a.weight / totalWeight) * 100,
      }))
      .sort((a, b) => b.contributionPp - a.contributionPp);

    // Composición con valores CLP reales inicial/final por clase (returnPct CLP,
    // el hook lo re-basa a la moneda del cliente con el TC de cada fecha).
    const cashValue = snap.cash_value || 0;

    const comp: SeguimientoEmailData["composition"] = {
      equity: { initial: eqInit, final: eqFin, returnPct: eqInit > 0 ? ((eqFin / eqInit) - 1) * 100 : 0 },
      fixedIncome: { initial: fiInit, final: fiFin, returnPct: fiInit > 0 ? ((fiFin / fiInit) - 1) * 100 : 0 },
      alternatives: { initial: altInit, final: altFin, returnPct: altInit > 0 ? ((altFin / altInit) - 1) * 100 : 0 },
      cash: { initial: cashValue, final: cashValue, returnPct: 0 },
    };

    const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

    return {
      comp,
      holdingRets: holdingRets.slice(0, 20),
      attrList,
      returnsBasis: { fromDate: fmtDate(startDate), toDate: fmtDate(endDate) },
      fromISO: startDate,
      toISO: endDate,
      monthTotalValue: eqFin + fiFin + altFin + cashValue,
    };
  } catch (err) {
    console.warn("[useSeguimientoEmail] prices-at-date API error:", err);
    return null;
  }
}

// ---------- Hook ----------

export function useSeguimientoEmail({
  clientId,
  data,
  holdingReturnsData,
  periodReturns,
  benchmarkReturns,
  benchmarkLabel,
  currentExchangeRates,
  exchangeRates,
  livePortfolioValue,
  displayCurrency,
  accumulatedReturn,
  fxRateAt,
}: UseSeguimientoEmailProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [reportMonth, setReportMonth] = useState<string | null>(null);
  const [apiMonthlyResult, setApiMonthlyResult] = useState<MonthlyResult | null>(null);

  const assembleSeguimientoData = useCallback((): SeguimientoEmailData | null => {
    const metrics = data?.metrics;
    if (!data || !metrics) return null;
    const rates = (currentExchangeRates || exchangeRates);
    if (!rates) return null;

    const latestValue = livePortfolioValue ?? metrics.currentValue;

    // --- Monthly computation: THIS IS THE CORE OF THE REPORT ---
    // A monthly closing report ALWAYS shows monthly data, never accumulated "desde inicio"
    // Try snapshot-based computation first, fall back to API-fetched result
    let monthly: MonthlyResult | null = null;
    if (reportMonth && data.snapshots) {
      monthly = computeMonthlyData(reportMonth, data.snapshots, holdingReturnsData);
    }
    if (!monthly && apiMonthlyResult) {
      monthly = apiMonthlyResult;
    }

    // --- Composition & returns basis ---
    let comp: SeguimientoEmailData["composition"];
    let returnsBasis: { fromDate: string; toDate: string; isMonthly?: boolean } | undefined;
    let reportTotalValue = latestValue;

    // Tasas por fecha del período: inicial (fromISO) y final (toISO). Así cada valor
    // se convierte a la moneda del cliente con el TC de SU fecha (no el de hoy).
    const ratesFinal = (monthly && fxRateAt)
      ? { usd: fxRateAt("USD", monthly.toISO) || rates.usd, uf: fxRateAt("UF", monthly.toISO) || rates.uf }
      : rates;
    const ratesInitial = (monthly && fxRateAt)
      ? { usd: fxRateAt("USD", monthly.fromISO) || rates.usd, uf: fxRateAt("UF", monthly.fromISO) || rates.uf }
      : rates;

    if (monthly) {
      comp = monthly.comp;
      returnsBasis = { ...monthly.returnsBasis, isMonthly: true };
      reportTotalValue = monthly.monthTotalValue || latestValue;
    } else {
      // No monthly data available (e.g., < 2 snapshots) — show current composition with 0% returns
      const eqFinal = holdingReturnsData?.equityHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const fiFinal = (holdingReturnsData?.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0)
        + (holdingReturnsData?.bondHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0);
      const altFinal = holdingReturnsData?.alternativesHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const cashFinal = holdingReturnsData?.cashValue || metrics.currentValue * (metrics.composition.cash / 100);
      comp = {
        equity: { initial: eqFinal, final: eqFinal, returnPct: 0 },
        fixedIncome: { initial: fiFinal, final: fiFinal, returnPct: 0 },
        alternatives: { initial: altFinal, final: altFinal, returnPct: 0 },
        cash: { initial: cashFinal, final: cashFinal, returnPct: 0 },
      };
    }

    // === Re-base a la moneda del cliente ===================================
    // El retorno honesto en R sale del ratio de valores convertidos a R con el TC
    // de cada fecha (inicial a ratesInitial, final a ratesFinal). En CLP incluye el
    // FX; en la moneda del instrumento lo excluye. Mismo criterio que CompositionBoxes.
    const R = (displayCurrency || "CLP").toUpperCase();
    const toR = (clp: number, rt: { usd: number; uf: number }): number => {
      if (R === "USD") return rt.usd ? clp / rt.usd : clp;
      if (R === "UF") return rt.uf ? clp / rt.uf : clp;
      return clp; // CLP
    };
    let totInitR = 0, totFinR = 0;
    for (const k of ["equity", "fixedIncome", "alternatives", "cash"] as const) {
      // La caja no tiene rentabilidad: se valoriza a la tasa de FIN en ambas puntas
      // para no inventar un retorno por FX sobre efectivo.
      const initRates = k === "cash" ? ratesFinal : ratesInitial;
      const initR = toR(comp[k].initial, initRates);
      const finR = toR(comp[k].final, ratesFinal);
      comp[k] = { ...comp[k], returnPct: initR > 0 ? ((finR / initR) - 1) * 100 : 0 };
      totInitR += initR;
      totFinR += finR;
    }
    const monthlyReturnR = totInitR > 0 ? ((totFinR / totInitR) - 1) * 100 : null;

    // --- Period returns (always from live data) ---
    const pr: SeguimientoEmailData["periodReturns"] = {};
    for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
      const ret = periodReturns?.[p as keyof typeof periodReturns] as { nominal: number; real: number | null; usd: number | null } | null;
      pr[p] = ret ? { nominal: ret.nominal, real: ret.real ?? null, usd: ret.usd ?? null } : { nominal: null, real: null, usd: null };
    }

    // --- Distribution (always from live holdingReturnsData) ---
    const distByType: Array<{ label: string; pct: number }> = [];
    const distByCurrency: Array<{ label: string; pct: number }> = [];
    if (holdingReturnsData) {
      const typeMap = new Map<string, number>();
      const currMap = new Map<string, number>();
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        const type = (h as { assetType?: string }).assetType || "Otro";
        typeMap.set(type, (typeMap.get(type) || 0) + (h.weight || 0));
        const curr = (h as { currency?: string }).currency || "CLP";
        currMap.set(curr, (currMap.get(curr) || 0) + (h.weight || 0));
      }
      if (holdingReturnsData.cashValue && holdingReturnsData.totalValue) {
        const cashPct = (holdingReturnsData.cashValue / holdingReturnsData.totalValue) * 100;
        typeMap.set("Caja", (typeMap.get("Caja") || 0) + cashPct);
        currMap.set("CLP", (currMap.get("CLP") || 0) + cashPct);
      }
      for (const [label, pct] of [...typeMap.entries()].sort((a, b) => b[1] - a[1])) distByType.push({ label, pct });
      for (const [label, pct] of [...currMap.entries()].sort((a, b) => b[1] - a[1])) distByCurrency.push({ label, pct });
    }

    // --- Benchmark comparison ---
    let bmComp: SeguimientoEmailData["benchmarkComparison"] = null;
    if (benchmarkReturns && periodReturns) {
      const periods: Record<string, { portfolio: number | null; benchmark: number | null; diff: number | null }> = {};
      for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
        const pRet = (periodReturns as Record<string, { nominal: number } | null>)?.[p]?.nominal ?? null;
        const bRet = (benchmarkReturns as Record<string, number>)?.[p] ?? null;
        if (pRet !== null || bRet !== null) {
          periods[p] = {
            portfolio: pRet,
            benchmark: bRet,
            diff: pRet !== null && bRet !== null ? pRet - bRet : null,
          };
        }
      }
      if (Object.keys(periods).length > 0) {
        bmComp = { label: benchmarkLabel, periods };
      }
    }

    // --- Holding returns & attribution (ALWAYS monthly, never accumulated) ---
    // Re-base de la tabla por posición a la moneda del cliente. Los retornos vienen
    // en CLP (valor cuota o CLP real); se re-basan con el FX del período. La
    // contribución se ajusta manteniendo la proporción retR/retCLP.
    const posFactor = R === "USD"
      ? (ratesFinal.usd > 0 ? ratesInitial.usd / ratesFinal.usd : 1)
      : R === "UF"
        ? (ratesFinal.uf > 0 ? ratesInitial.uf / ratesFinal.uf : 1)
        : 1;
    const rebasePos = (retCLP: number): number => R === "CLP" ? retCLP : ((1 + retCLP / 100) * posFactor - 1) * 100;
    const retClpByName = new Map<string, number>((monthly?.holdingRets || []).map(h => [h.name, h.returnPct]));
    const holdingRetList: SeguimientoEmailData["holdingReturns"] = (monthly?.holdingRets || [])
      .map(h => ({ ...h, returnPct: rebasePos(h.returnPct) }));
    const attrList: SeguimientoEmailData["attribution"] = (monthly?.attrList || []).map(a => {
      const retCLP = retClpByName.get(a.name);
      const contribR = (retCLP != null && Math.abs(retCLP) > 1e-9)
        ? a.contributionPp * (rebasePos(retCLP) / retCLP)
        : a.contributionPp * posFactor;
      return { ...a, contributionPp: contribR };
    });

    // --- Monthly total return (used in summary card + narrative) ---
    let monthlyTotalRet: number | null = null;
    if (monthly) {
      if (typeof monthly.monthlyReturnPct === "number") {
        // Retorno por valor cuota ponderado (no distorsionado por aportes/retiros),
        // re-basado a R con el FX del período (fx_inicio/fx_fin).
        const fFrom = R === "USD" ? ratesInitial.usd : R === "UF" ? ratesInitial.uf : 1;
        const fTo = R === "USD" ? ratesFinal.usd : R === "UF" ? ratesFinal.uf : 1;
        const factor = fFrom > 0 && fTo > 0 ? fFrom / fTo : 1;
        monthlyTotalRet = ((1 + monthly.monthlyReturnPct / 100) * factor - 1) * 100;
      } else {
        // Sin valor cuota (path API): ratio de valores por clase ya en R.
        monthlyTotalRet = monthlyReturnR;
      }
    }

    // --- Narrative ---
    let narrative = narrativeText;
    if (!narrative) {
      const parts: string[] = [];
      const clientFirst = data.client.nombre;
      const totalRet = monthlyTotalRet ?? pr["1M"]?.nominal ?? holdingReturnsData?.portfolioReturn ?? accumulatedReturn ?? metrics.totalReturn;
      if (totalRet !== null && totalRet !== undefined) {
        const sign = totalRet >= 0 ? "positivo" : "negativo";
        parts.push(`El portafolio de ${clientFirst} ha tenido un desempeno ${sign} con una rentabilidad de ${totalRet >= 0 ? "+" : ""}${totalRet.toFixed(1)}% en el periodo.`);
      }
      if (comp.equity.returnPct !== 0 || comp.fixedIncome.returnPct !== 0) {
        const eqDir = comp.equity.returnPct >= 0 ? "subio" : "bajo";
        const fiDir = comp.fixedIncome.returnPct >= 0 ? "subio" : "bajo";
        parts.push(`La renta variable ${eqDir} ${comp.equity.returnPct >= 0 ? "+" : ""}${comp.equity.returnPct.toFixed(1)}% y la renta fija ${fiDir} ${comp.fixedIncome.returnPct >= 0 ? "+" : ""}${comp.fixedIncome.returnPct.toFixed(1)}%.`);
      }
      if (holdingRetList.length > 0) {
        const best = holdingRetList[0];
        const worst = holdingRetList[holdingRetList.length - 1];
        parts.push(`La posicion de mayor rendimiento fue ${best.name} (${best.returnPct >= 0 ? "+" : ""}${best.returnPct.toFixed(1)}%) y la de menor rendimiento fue ${worst.name} (${worst.returnPct >= 0 ? "+" : ""}${worst.returnPct.toFixed(1)}%).`);
      }
      narrative = parts.length > 0 ? parts.join("\n\n") : `Reporte de seguimiento del portafolio de ${clientFirst} generado el ${new Date().toLocaleDateString("es-CL")}.`;
    }

    // --- Month label for report title ---
    const monthLabel = reportMonth
      ? new Date(Number(reportMonth.split("-")[0]), Number(reportMonth.split("-")[1]) - 1, 1)
          .toLocaleDateString("es-CL", { month: "long", year: "numeric" })
      : null;

    return {
      clientName: `${data.client.nombre} ${data.client.apellido}`,
      reportDate: monthLabel
        ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
        : new Date().toLocaleDateString("es-CL"),
      perfilCliente: data.client.perfil_riesgo || "moderado",
      totalValueCLP: reportTotalValue,
      displayCurrency: displayCurrency,
      exchangeRates: rates,
      ratesInitial,
      ratesFinal,
      composition: comp,
      periodReturns: pr,
      distribution: { byAssetType: distByType, byCurrency: distByCurrency },
      benchmarkComparison: bmComp,
      holdingReturns: holdingRetList,
      attribution: attrList,
      monthlyReturn: monthlyTotalRet ?? pr["1M"]?.nominal ?? holdingReturnsData?.portfolioReturn ?? accumulatedReturn ?? null,
      netCashFlowCLP: monthly?.netCashFlowCLP ?? null,
      narrative,
      returnsBasis,
      platformUrl: typeof window !== "undefined" ? `${window.location.origin}/clients/${clientId}/seguimiento` : "",
    };
  }, [data, holdingReturnsData, periodReturns, benchmarkReturns, benchmarkLabel, currentExchangeRates, exchangeRates, livePortfolioValue, displayCurrency, narrativeText, clientId, accumulatedReturn, reportMonth, apiMonthlyResult, fxRateAt]);

  const openSendModal = useCallback(async () => {
    if (!clientEmail) {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const d = await res.json();
        if (d.success && d.data?.client?.email) {
          setClientEmail(d.data.client.email);
        }
      } catch { /* ignore */ }
    }

    // Determine report month: try prevMonth first, then currentMonth
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

    if (!narrativeText && !loadingNarrative) {
      setLoadingNarrative(true);
      let foundMonth: string | null = null;

      for (const month of [prevMonth, currentMonth]) {
        try {
          const res = await fetch(`/api/client-closings?clientId=${clientId}&month=${month}`);
          const d = await res.json();
          if (d.success && d.closing?.content) {
            setNarrativeText(d.closing.content);
            foundMonth = month;
            break;
          }
        } catch { /* ignore */ }
      }

      const selectedMonth = foundMonth || prevMonth;
      setReportMonth(selectedMonth);

      // If < 2 cartolas, fetch monthly data from prices-at-date API
      if (data?.snapshots && holdingReturnsData) {
        const cartolas = data.snapshots.filter(s => s.source !== "api-prices");
        if (cartolas.length < 2) {
          const apiResult = await fetchMonthlyFromAPI(selectedMonth, data.snapshots, holdingReturnsData, fxRateAt);
          setApiMonthlyResult(apiResult);
        }
      }

      setLoadingNarrative(false);
    } else if (!reportMonth) {
      // Narrative already set but no month — default to prevMonth
      const selectedMonth = prevMonth;
      setReportMonth(selectedMonth);

      // Same API fallback check
      if (data?.snapshots && holdingReturnsData) {
        const cartolas = data.snapshots.filter(s => s.source !== "api-prices");
        if (cartolas.length < 2) {
          const apiResult = await fetchMonthlyFromAPI(selectedMonth, data.snapshots, holdingReturnsData, fxRateAt);
          setApiMonthlyResult(apiResult);
        }
      }
    }

    setShowSendModal(true);
  }, [clientId, clientEmail, narrativeText, loadingNarrative, reportMonth, data, holdingReturnsData]);

  return {
    showSendModal,
    setShowSendModal,
    clientEmail,
    openSendModal,
    assembleSeguimientoData,
    reportMonth,
  };
}
