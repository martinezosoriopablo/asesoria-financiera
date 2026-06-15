"use client";

import { useState, useCallback } from "react";
import type { SeguimientoEmailData } from "@/lib/seguimiento-email";
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
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  assetType?: string;
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
}

// ---------- Monthly computation helper ----------

interface MonthlyResult {
  comp: SeguimientoEmailData["composition"];
  holdingRets: SeguimientoEmailData["holdingReturns"];
  attrList: SeguimientoEmailData["attribution"];
  returnsBasis: { fromDate: string; toDate: string };
  monthTotalValue: number;
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
    monthTotalValue: endSnap.total_value,
  };
}

function computeMonthlyDataWithSnaps(
  startSnap: EmailSnapshot,
  endSnap: EmailSnapshot,
  holdingReturnsData: HoldingReturnsData,
): MonthlyResult {
  // Build CLP value maps from snapshot holdings
  const buildValueMap = (snap: EmailSnapshot): Map<string, number> => {
    const map = new Map<string, number>();
    const holdings = snap.holdings as SnapHolding[];
    for (const h of holdings) {
      if (!h.fundName) continue;
      const clp = (h.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h.marketValue || 0);
      map.set(h.fundName, (map.get(h.fundName) || 0) + clp);
    }
    return map;
  };

  const startValues = buildValueMap(startSnap);
  const endValues = buildValueMap(endSnap);

  // Classify holdings using current holdingReturnsData grouping (avoids classification mismatch)
  const classOf = new Map<string, "equity" | "fixedIncome" | "alternatives">();
  const typeOf = new Map<string, string>();
  for (const h of holdingReturnsData.equityHoldings) {
    classOf.set(h.fundName, "equity");
    typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund");
  }
  for (const h of holdingReturnsData.fixedIncomeFundHoldings) {
    classOf.set(h.fundName, "fixedIncome");
    typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund");
  }
  for (const h of holdingReturnsData.bondHoldings) {
    classOf.set(h.fundName, "fixedIncome");
    typeOf.set(h.fundName, "bond");
  }
  for (const h of (holdingReturnsData.alternativesHoldings || [])) {
    classOf.set(h.fundName, "alternatives");
    typeOf.set(h.fundName, (h as { assetType?: string }).assetType || "fund");
  }

  // Compute per-class and per-holding data
  let eqStart = 0, eqEnd = 0, fiStart = 0, fiEnd = 0, altStart = 0, altEnd = 0;
  const holdingResults: Array<{ name: string; assetType: string; startCLP: number; endCLP: number }> = [];

  const allNames = Array.from(new Set([...Array.from(startValues.keys()), ...Array.from(endValues.keys())]));
  for (const name of allNames) {
    const sCLP = startValues.get(name) || 0;
    const eCLP = endValues.get(name) || 0;
    if (sCLP === 0 && eCLP === 0) continue;

    const cls = classOf.get(name);
    if (cls === "equity") { eqStart += sCLP; eqEnd += eCLP; }
    else if (cls === "fixedIncome") { fiStart += sCLP; fiEnd += eCLP; }
    else if (cls === "alternatives") { altStart += sCLP; altEnd += eCLP; }
    else {
      // Unknown holding (not in current holdingReturnsData) — try snapshot assetClass
      const endH = (endSnap.holdings as SnapHolding[]).find(h => h.fundName === name);
      const ac = (endH?.assetClass || "").toLowerCase();
      if (ac.includes("fixed") || ac.includes("fija")) { fiStart += sCLP; fiEnd += eCLP; }
      else if (ac.includes("alter")) { altStart += sCLP; altEnd += eCLP; }
      else { eqStart += sCLP; eqEnd += eCLP; }
    }

    holdingResults.push({ name, assetType: typeOf.get(name) || "Otro", startCLP: sCLP, endCLP: eCLP });
  }

  const cashStart = startSnap.cash_value || 0;
  const cashEnd = endSnap.cash_value || 0;

  // Composition
  const comp: SeguimientoEmailData["composition"] = {
    equity: { initial: eqStart, final: eqEnd, returnPct: eqStart > 0 ? ((eqEnd / eqStart) - 1) * 100 : 0 },
    fixedIncome: { initial: fiStart, final: fiEnd, returnPct: fiStart > 0 ? ((fiEnd / fiStart) - 1) * 100 : 0 },
    alternatives: { initial: altStart, final: altEnd, returnPct: altStart > 0 ? ((altEnd / altStart) - 1) * 100 : 0 },
    cash: { initial: cashStart, final: cashEnd, returnPct: 0 },
  };

  // Holding returns
  const holdingRets = holdingResults
    .filter(h => h.endCLP > 0)
    .map(h => ({
      name: h.name,
      assetType: h.assetType,
      returnPct: h.startCLP > 0 ? ((h.endCLP / h.startCLP) - 1) * 100 : 0,
    }))
    .sort((a, b) => b.returnPct - a.returnPct)
    .slice(0, 20);

  // Attribution (contribution)
  const totalStartCLP = eqStart + fiStart + altStart + cashStart;
  const rawAttr = holdingResults
    .filter(h => h.endCLP > 0 || h.startCLP > 0)
    .map(h => ({
      name: h.name,
      instrumentType: h.assetType,
      contributionPp: totalStartCLP > 0 ? ((h.endCLP - h.startCLP) / totalStartCLP) * 100 : 0,
    }))
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
    monthTotalValue: endSnap.total_value,
  };
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
}: UseSeguimientoEmailProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [reportMonth, setReportMonth] = useState<string | null>(null);

  const assembleSeguimientoData = useCallback((): SeguimientoEmailData | null => {
    const metrics = data?.metrics;
    if (!data || !metrics) return null;
    const rates = (currentExchangeRates || exchangeRates);
    if (!rates) return null;

    const latestValue = livePortfolioValue ?? metrics.currentValue;

    // --- Monthly computation: THIS IS THE CORE OF THE REPORT ---
    // A monthly closing report ALWAYS shows monthly data, never accumulated "desde inicio"
    let monthly: MonthlyResult | null = null;
    if (reportMonth && data.snapshots) {
      monthly = computeMonthlyData(reportMonth, data.snapshots, holdingReturnsData);
    }

    // --- Composition & returns basis ---
    let comp: SeguimientoEmailData["composition"];
    let returnsBasis: { fromDate: string; toDate: string; isMonthly?: boolean } | undefined;
    let reportTotalValue = latestValue;

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
    const holdingRetList: SeguimientoEmailData["holdingReturns"] = monthly?.holdingRets || [];
    const attrList: SeguimientoEmailData["attribution"] = monthly?.attrList || [];

    // --- Narrative ---
    let narrative = narrativeText;
    if (!narrative) {
      const parts: string[] = [];
      const clientFirst = data.client.nombre;
      // For monthly report, compute total monthly return from composition data
      let monthlyTotalRet: number | null = null;
      if (monthly) {
        const totalStart = (comp.equity.initial + comp.fixedIncome.initial + comp.alternatives.initial + comp.cash.initial);
        const totalEnd = (comp.equity.final + comp.fixedIncome.final + comp.alternatives.final + comp.cash.final);
        monthlyTotalRet = totalStart > 0 ? ((totalEnd / totalStart) - 1) * 100 : 0;
      }
      const totalRet = monthlyTotalRet ?? pr["1M"]?.nominal ?? accumulatedReturn ?? metrics.totalReturn;
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
      composition: comp,
      periodReturns: pr,
      distribution: { byAssetType: distByType, byCurrency: distByCurrency },
      benchmarkComparison: bmComp,
      holdingReturns: holdingRetList,
      attribution: attrList,
      narrative,
      returnsBasis,
      platformUrl: typeof window !== "undefined" ? `${window.location.origin}/clients/${clientId}/seguimiento` : "",
    };
  }, [data, holdingReturnsData, periodReturns, benchmarkReturns, benchmarkLabel, currentExchangeRates, exchangeRates, livePortfolioValue, displayCurrency, narrativeText, clientId, accumulatedReturn, reportMonth]);

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

      setReportMonth(foundMonth || prevMonth);
      setLoadingNarrative(false);
    } else if (!reportMonth) {
      // Narrative already set but no month — default to prevMonth
      setReportMonth(prevMonth);
    }

    setShowSendModal(true);
  }, [clientId, clientEmail, narrativeText, loadingNarrative, reportMonth]);

  return {
    showSendModal,
    setShowSendModal,
    clientEmail,
    openSendModal,
    assembleSeguimientoData,
    reportMonth,
  };
}
