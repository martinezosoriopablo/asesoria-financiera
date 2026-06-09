"use client";

import { useState, useCallback } from "react";
import { formatNumber } from "@/lib/format";
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

interface UseSeguimientoEmailProps {
  clientId: string;
  data: { client: Client; metrics: Metrics | null } | null;
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

  const assembleSeguimientoData = useCallback((): SeguimientoEmailData | null => {
    const metrics = data?.metrics;
    if (!data || !metrics) return null;
    const rates = (currentExchangeRates || exchangeRates);
    if (!rates) return null;

    const latestValue = livePortfolioValue ?? metrics.currentValue;
    const initialValue = metrics.initialValue;

    let comp: SeguimientoEmailData["composition"];
    if (holdingReturnsData) {
      const hr = holdingReturnsData;
      const eqFinal = hr.equityHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const fiFinal = (hr.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0) +
                      (hr.bondHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0);
      const altFinal = hr.alternativesHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const cashFinal = hr.cashValue || 0;

      const eqInitial = initialValue * (metrics.composition.equity / 100);
      const fiInitial = initialValue * (metrics.composition.fixedIncome / 100);
      const altInitial = initialValue * (metrics.composition.alternatives / 100);
      const cashInitial = initialValue * (metrics.composition.cash / 100);

      comp = {
        equity: { initial: eqInitial, final: eqFinal, returnPct: eqInitial > 0 ? ((eqFinal / eqInitial) - 1) * 100 : 0 },
        fixedIncome: { initial: fiInitial, final: fiFinal, returnPct: fiInitial > 0 ? ((fiFinal / fiInitial) - 1) * 100 : 0 },
        alternatives: { initial: altInitial, final: altFinal, returnPct: altInitial > 0 ? ((altFinal / altInitial) - 1) * 100 : 0 },
        cash: { initial: cashInitial, final: cashFinal, returnPct: 0 },
      };
    } else {
      comp = {
        equity: { initial: initialValue * metrics.composition.equity / 100, final: latestValue * metrics.composition.equity / 100, returnPct: 0 },
        fixedIncome: { initial: initialValue * metrics.composition.fixedIncome / 100, final: latestValue * metrics.composition.fixedIncome / 100, returnPct: 0 },
        alternatives: { initial: initialValue * metrics.composition.alternatives / 100, final: latestValue * metrics.composition.alternatives / 100, returnPct: 0 },
        cash: { initial: initialValue * metrics.composition.cash / 100, final: latestValue * metrics.composition.cash / 100, returnPct: 0 },
      };
    }

    const pr: SeguimientoEmailData["periodReturns"] = {};
    for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
      const ret = periodReturns?.[p as keyof typeof periodReturns] as { nominal: number; real: number | null; usd: number | null } | null;
      pr[p] = ret ? { nominal: ret.nominal, real: ret.real ?? null, usd: ret.usd ?? null } : { nominal: null, real: null, usd: null };
    }

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

    const holdingRetList: SeguimientoEmailData["holdingReturns"] = [];
    if (holdingReturnsData) {
      const allHoldings = [
        ...(holdingReturnsData.equityHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Accion", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Fondo", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.bondHoldings || []).map((h: { fundName: string; totalReturn?: number }) => ({ name: h.fundName, assetType: "Bono", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.alternativesHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Alternativo", returnPct: h.totalReturn ?? 0 })),
      ];
      allHoldings.sort((a, b) => b.returnPct - a.returnPct);
      holdingRetList.push(...allHoldings.slice(0, 20));
    }

    const attrList: SeguimientoEmailData["attribution"] = [];
    if (holdingReturnsData) {
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        attrList.push({
          name: h.fundName,
          instrumentType: (h as { assetType?: string }).assetType || "Otro",
          contributionPp: h.contribution ?? 0,
        });
      }
      attrList.sort((a, b) => b.contributionPp - a.contributionPp);
      const positives = attrList.filter(a => a.contributionPp >= 0);
      const negatives = attrList.filter(a => a.contributionPp < 0);
      const maxPerSide = 10;
      attrList.length = 0;
      attrList.push(...positives.slice(0, maxPerSide), ...negatives.slice(0, maxPerSide));
    }

    // Build narrative: use saved narrativeText, or generate programmatic fallback
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

    return {
      clientName: `${data.client.nombre} ${data.client.apellido}`,
      reportDate: new Date().toLocaleDateString("es-CL"),
      perfilCliente: data.client.perfil_riesgo || "moderado",
      totalValueCLP: latestValue,
      displayCurrency: displayCurrency,
      exchangeRates: rates,
      composition: comp,
      periodReturns: pr,
      distribution: { byAssetType: distByType, byCurrency: distByCurrency },
      benchmarkComparison: bmComp,
      holdingReturns: holdingRetList,
      attribution: attrList,
      narrative,
      platformUrl: typeof window !== "undefined" ? `${window.location.origin}/clients/${clientId}/seguimiento` : "",
    };
  }, [data, holdingReturnsData, periodReturns, benchmarkReturns, benchmarkLabel, currentExchangeRates, exchangeRates, livePortfolioValue, displayCurrency, narrativeText, clientId, accumulatedReturn]);

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

    if (!narrativeText && !loadingNarrative) {
      setLoadingNarrative(true);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

      for (const month of [prevMonth, currentMonth]) {
        try {
          const res = await fetch(`/api/client-closings?clientId=${clientId}&month=${month}`);
          const d = await res.json();
          if (d.success && d.closing?.content) {
            setNarrativeText(d.closing.content);
            break;
          }
        } catch { /* ignore */ }
      }

      setLoadingNarrative(false);
    }

    setShowSendModal(true);
  }, [clientId, clientEmail, narrativeText, loadingNarrative]);

  return {
    showSendModal,
    setShowSendModal,
    clientEmail,
    openSendModal,
    assembleSeguimientoData,
  };
}
