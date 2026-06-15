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
  holdingReturnsData: HoldingReturnsData,
): MonthlyResult | null {
  const [y, m] = reportMonth.split("-").map(Number);
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;

  // Only use cartola snapshots (not api-prices) with holdings
  const cartolas = snapshots
    .filter(s => s.source !== "api-prices" && s.holdings && Array.isArray(s.holdings) && (s.holdings as unknown[]).length > 0)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  if (cartolas.length < 2) return null;

  // End snap: nearest cartola on or before monthEnd
  let endSnap: EmailSnapshot | null = null;
  for (const s of cartolas) {
    if (s.snapshot_date <= monthEnd) endSnap = s;
    else break;
  }
  if (!endSnap) return null;

  // Start snap: the cartola just BEFORE endSnap (previous cartola, ideally before monthStart)
  const endIdx = cartolas.indexOf(endSnap);
  const startSnap = endIdx > 0 ? cartolas[endIdx - 1] : null;
  if (!startSnap || startSnap.snapshot_date === endSnap.snapshot_date) return null;

  // If both snapshots are in the same month and there's an earlier one available, prefer it
  if (startSnap.snapshot_date.startsWith(reportMonth) && endIdx > 1) {
    // Try to find a cartola before the report month for a proper month-over-month comparison
    const beforeMonth = cartolas.filter(s => s.snapshot_date < monthStart);
    if (beforeMonth.length > 0) {
      const betterStart = beforeMonth[beforeMonth.length - 1];
      // Use the earlier start snap for a proper period
      return computeMonthlyDataWithSnaps(betterStart, endSnap, holdingReturnsData);
    }
  }

  return computeMonthlyDataWithSnaps(startSnap, endSnap, holdingReturnsData);
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

    // --- Try monthly computation first ---
    let monthly: MonthlyResult | null = null;
    if (reportMonth && holdingReturnsData && data.snapshots) {
      monthly = computeMonthlyData(reportMonth, data.snapshots, holdingReturnsData);
    }

    // --- Composition ---
    let comp: SeguimientoEmailData["composition"];
    let returnsBasis: { fromDate: string; toDate: string; isMonthly?: boolean } | undefined;
    let reportTotalValue = latestValue;

    if (monthly) {
      // Use monthly data
      comp = monthly.comp;
      returnsBasis = { ...monthly.returnsBasis, isMonthly: true };
      reportTotalValue = monthly.monthTotalValue || latestValue;
    } else if (holdingReturnsData) {
      // Fallback: desde inicio
      const hr = holdingReturnsData;
      const eqFinal = hr.equityHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const fiFinal = (hr.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0) +
                      (hr.bondHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0);
      const altFinal = hr.alternativesHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const cashFinal = hr.cashValue || 0;

      const initFromReturn = (h: { marketValue: number; totalReturn?: number; returnPrice?: number }) => {
        const ret = (h.totalReturn ?? h.returnPrice ?? 0) / 100;
        return ret !== 0 ? h.marketValue / (1 + ret) : h.marketValue;
      };
      const eqInitial = hr.equityHoldings?.reduce((s: number, h: { marketValue: number; totalReturn?: number; returnPrice?: number }) => s + initFromReturn(h), 0) || 0;
      const fiInitial = (hr.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number; totalReturn?: number; returnPrice?: number }) => s + initFromReturn(h), 0) || 0)
        + (hr.bondHoldings?.reduce((s: number, h: { marketValue: number; totalReturn?: number; costBasis?: number }) => {
          const ret = (h.totalReturn ?? 0) / 100;
          return s + (ret !== 0 ? h.marketValue / (1 + ret) : (h.costBasis && h.costBasis > 0 ? h.costBasis : h.marketValue));
        }, 0) || 0);
      const altInitial = hr.alternativesHoldings?.reduce((s: number, h: { marketValue: number; totalReturn?: number; returnPrice?: number }) => s + initFromReturn(h), 0) || 0;
      const cashInitial = metrics.initialValue * (metrics.composition.cash / 100);

      comp = {
        equity: { initial: eqInitial, final: eqFinal, returnPct: eqInitial > 0 ? ((eqFinal / eqInitial) - 1) * 100 : 0 },
        fixedIncome: { initial: fiInitial, final: fiFinal, returnPct: fiInitial > 0 ? ((fiFinal / fiInitial) - 1) * 100 : 0 },
        alternatives: { initial: altInitial, final: altFinal, returnPct: altInitial > 0 ? ((altFinal / altInitial) - 1) * 100 : 0 },
        cash: { initial: cashInitial, final: cashFinal, returnPct: 0 },
      };

      const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
      // Use cartola snapshots (not api-prices) for the date range
      const cartolaSnaps = (data.snapshots || [])
        .filter(s => s.source !== "api-prices")
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      returnsBasis = cartolaSnaps.length >= 2
        ? { fromDate: fmtDate(cartolaSnaps[0].snapshot_date), toDate: fmtDate(cartolaSnaps[cartolaSnaps.length - 1].snapshot_date) }
        : cartolaSnaps.length === 1
        ? { fromDate: fmtDate(cartolaSnaps[0].snapshot_date), toDate: fmtDate(new Date().toISOString().split("T")[0]) }
        : undefined;
    } else {
      const initialValue = metrics.initialValue;
      comp = {
        equity: { initial: initialValue * metrics.composition.equity / 100, final: latestValue * metrics.composition.equity / 100, returnPct: 0 },
        fixedIncome: { initial: initialValue * metrics.composition.fixedIncome / 100, final: latestValue * metrics.composition.fixedIncome / 100, returnPct: 0 },
        alternatives: { initial: initialValue * metrics.composition.alternatives / 100, final: latestValue * metrics.composition.alternatives / 100, returnPct: 0 },
        cash: { initial: initialValue * metrics.composition.cash / 100, final: latestValue * metrics.composition.cash / 100, returnPct: 0 },
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

    // --- Holding returns & attribution ---
    let holdingRetList: SeguimientoEmailData["holdingReturns"];
    let attrList: SeguimientoEmailData["attribution"];

    if (monthly) {
      // Monthly data
      holdingRetList = monthly.holdingRets;
      attrList = monthly.attrList;
    } else if (holdingReturnsData) {
      // Desde inicio
      holdingRetList = [
        ...(holdingReturnsData.equityHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Accion", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Fondo", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.bondHoldings || []).map((h: { fundName: string; totalReturn?: number }) => ({ name: h.fundName, assetType: "Bono", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.alternativesHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Alternativo", returnPct: h.totalReturn ?? 0 })),
      ].sort((a, b) => b.returnPct - a.returnPct).slice(0, 20);

      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      const rawAttr = allH.map(h => ({
        name: h.fundName,
        instrumentType: (h as { assetType?: string }).assetType || "Otro",
        contributionPp: h.contribution ?? 0,
      })).sort((a, b) => b.contributionPp - a.contributionPp);

      const positives = rawAttr.filter(a => a.contributionPp >= 0);
      const negatives = rawAttr.filter(a => a.contributionPp < 0);
      attrList = [...positives.slice(0, 10), ...negatives.slice(0, 10)];
    } else {
      holdingRetList = [];
      attrList = [];
    }

    // --- Narrative ---
    let narrative = narrativeText;
    if (!narrative) {
      const parts: string[] = [];
      const clientFirst = data.client.nombre;
      const ytdRet = pr["YTD"]?.nominal;
      const oneMRet = pr["1M"]?.nominal;
      const totalRet = ytdRet ?? oneMRet ?? accumulatedReturn ?? metrics.totalReturn;
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
